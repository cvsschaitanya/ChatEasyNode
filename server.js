const path = require("path");
const express = require("express");
// const theCookieParser = require("cookie-parser");
// const ParseCookieTool = require("cookie-parse");
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

router.post("/chat", function (req, res) {
	username = req.body["username"];

	req.session.username = username;
	res.send("OK cool!");
	// res.redirect("/chat");
});

// app.use(theCookieParser());

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
		this.emit("message", "Thank you");
	});

	sock.on("naming", function (data) {
		this.emit("naming", userOf[this["id"]]);
	});

	sock.on("new-chat", (chat) => {
		console.log("Received a new chat");
		console.log(chat);
		addChat(chat);

		if (chat["_FROM"] in socketOf)
			socketOf[chat["_FROM"]].emit("new-chat-list", [chat]);
		if (chat["_TO"] in socketOf)
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
