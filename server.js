const path = require("path");
const express = require("express");

const bcrypt = require("bcrypt");
const saltRounds = 10;

const ExpressSession = require("express-session");
const memstore = new ExpressSession.MemoryStore();
const session = ExpressSession({
	resave: false,
	saveUninitialized: false,
	secret: "my super secret",
	cookie: {
		maxAge: 1000 * 60 * 60 * 24,
		sameSite: true,
		secure: false,
	},
	store: memstore,
});

var http = require("http");

var router = express.Router();

var app = express();
var httpServer = http.createServer(app);

httpServer.listen(process.env.PORT || 3000);

var io = require("socket.io")().listen(httpServer);

//assuming app is express Object.
router.get("/", function (req, res) {
	const username = req.session["username"];

	if (username) res.redirect("/chat");
	else res.sendFile(path.join(__dirname, "index.html"));
});

router.get("/chat", function (req, res) {
	const username = req.session["username"];

	if (!username) res.redirect("/");
	else res.sendFile(path.join(__dirname, "chat.html"));
});

router.get("/another-login", function (req, res) {
	res.sendFile(path.join(__dirname, "another-login.html"));
});

router.get("/signout", function (req, res) {
	memstore.destroy(req.session["id"], () => {
		res.redirect("/");
	});
});

router.get("/other", function (req, res) {
	res.sendFile(path.join(__dirname, "build/index.html"));
});

router.post("/signin", function (req, res) {
	username = req.body["username"];
	password = req.body["password"];

	db.serialize(() => {
		db.all(
			"SELECT * FROM _USERS WHERE username = ?;",
			[username],
			(error, rows) => {
				if (error != null) console.log("Error:" + error);
				else if (rows.length == 0) {
					res.status(404);
					res.send("No such user");
				} else {
					bcrypt.compare(
						password,
						rows[0]["password"],
						function (err, result) {
							if (err) {
								console.log("Password Hashing Check Error:");
								console.log(err);
								return;
							}

							if (result) {
								req.session.username = username;
								res.send("OK cool!");
								// res.redirect("/chat");
							} else {
								res.status(403);
								res.send("Wrong password");
							}
						}
					);
				}
			}
		);
	});
});

router.post("/register", function (req, res) {
	username = req.body["username"];
	password = req.body["password"];

	db.serialize(() => {
		db.all(
			"SELECT * FROM _USERS WHERE username = ?;",
			[username],
			(error, rows) => {
				if (error != null) console.log("Error:" + error);
				else if (rows.length > 0) {
					res.status(409);
					res.send("Username exists");
				} else {
					req.session.username = username;

					bcrypt.hash(
						password,
						saltRounds,
						function (err, passwordhash) {
							if (err) {
								console.log("Password Hashing Error:");
								console.log(err);
								return;
							}
							db.serialize(() => {
								db.run(
									"INSERT INTO _USERS values (? , ? );",
									[username, passwordhash],
									(err) => {
										if (err) {
											console.error(err.message);
										} else {
											console.log(
												`New user ${username} added.`
											);
										}
									}
								);
							});
							res.send("OK cool!");
							// res.redirect("/chat");
						}
					);
				}
			}
		);
	});
});

// app.use(theCookieParser());

app.use("/public", express.static("public"));
app.use("/static", express.static("build/static"));
app.use(session);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/", router);

const sqlite3 = require("sqlite3").verbose();
let db = new sqlite3.Database(
	"./db/chats.db",
	sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
	(error) => {
		if (error === null) console.log("Successfully opened database.");
		else console.log("Failed to open database." + error);
	}
);

function addChat(chat) {
	db.serialize(() => {
		db.run(
			"INSERT INTO chats values (? , ? , ?);",
			[chat["_FROM"], chat["_TO"], chat["_MESSAGE"]],
			(err) => {
				if (err) {
					console.error(err.message);
				} else {
					console.log("Successfully Inserted");
				}
			}
		);
	});
}

socketOf = {};
userOf = {};
sessionOf = {};
var myip;

var sharedSession = require("express-socket.io-session");
io.use(sharedSession(session));

io.on("connection", (sock) => {
	username = sock.handshake.session.username;
	console.log(username + " connected");

	if (username in socketOf) {
		console.log(`${username} already exists`);
		userOf[socketOf[username]["id"]] = null;

		if (sessionOf[username] === sock.handshake.session.id) {
			socketOf[username].emit("soft-resign");
		} else {
			socketOf[username].emit("hard-resign");
		}
	}

	userOf[sock["id"]] = username;
	socketOf[username] = sock;
	sessionOf[username] = sock.handshake.session.id;

	sock.on("disconnect", () => {
		var username = userOf[sock["id"]];
		if (socketOf[username]) delete socketOf[username];
		if (userOf[sock["id"]]) delete userOf[sock["id"]];
		if (sessionOf[username]) delete sessionOf[username];
		if (username) console.log(username + " disconnected");
	});

	sock.on("message", function (data) {
		console.log("Client says: " + data);
		console.log(this);
		sock.emit("message", "Thank you");
	});

	sock.on("init", (data) => {
		// console.log(this);

		db.serialize(() => {
			db.all("SELECT username FROM _USERS;", [], (err, rows) => {
				let users = [];
				for (i = 0; i < rows.length; ++i) {
					users.push(rows[i].username);
				}
				init_reply_data = {
					name: userOf[sock["id"]],
					contacts: users,
				};
				console.log(init_reply_data);
				sock.emit("init-reply", init_reply_data);
			});
		});
	});

	sock.on("new-chat", (chat) => {
		console.log("Received a new chat");
		console.log(chat);
		addChat(chat);

		if (chat["_FROM"] in socketOf)
			socketOf[chat["_FROM"]].emit("new-chat-list", [chat]);
		if (chat["_FROM"] != chat["_TO"] && chat["_TO"] in socketOf)
			socketOf[chat["_TO"]].emit("new-chat-list", [chat]);
	});

	sock.on("extract-chats-between", (couple) => {
		console.log("extract requested for " + couple);
		db.serialize(() => {
			db.all(
				"SELECT * FROM chats WHERE (_FROM = ? AND _TO = ?) OR (_FROM = ? AND _TO = ?);",
				[couple[0], couple[1], couple[1], couple[0]],
				(error, rows) => {
					if (error != null) console.log("Error:" + error);
					else {
						console.log("extracted ");
						console.log(rows);
						sock.emit("new-chat-list", rows);
					}
				}
			);
		});
	});
});
