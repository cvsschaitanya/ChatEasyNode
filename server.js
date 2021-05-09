var path = require("path");
var express = require("express");
var theCookieParser = require("cookie-parser");
var ParseCookieTool = require("cookie-parse");
var http = require("http");

var router = express.Router();

var app = express();
var httpServer = http.createServer(app);

httpServer.listen(process.env.PORT || 3000);

var io = require("socket.io")().listen(httpServer);

//assuming app is express Object.
router.get("/", function (req, res) {
	res.sendFile(path.join(__dirname, "index.html"));
});

router.get("/chat", function (req, res) {
	const cookie = req.cookies;
	console.log(cookie);
	res.sendFile(path.join(__dirname, "chat.html"));
});

router.post("/chat", function (req, res) {
	username = req.body["username"];
	res.cookie("session-id", username);
	res.send("OK cool");
});

app.use(theCookieParser());
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
var myip;

io.on("connection", (sock) => {
	username = ParseCookieTool.parse(sock.request.headers.cookie)["session-id"];
	console.log(username + " connected");
	userOf[sock["id"]] = username;
	socketOf[username] = sock;
	// console.log(socketOf);
	// console.log(userOf);

	sock.on("disconnect", () => {
		var username = userOf[sock["id"]];
		delete socketOf[username];
		delete userOf[sock["id"]];
		console.log(username + " disconnected");
		// console.log(socketOf);
		// console.log(userOf);
	});

	sock.on("message", function (data) {
		console.log("Client says: " + data);
		this.emit("message", "Thank you");
	});

	sock.on("naming", function (data) {
		this.emit("naming", userOf[this["id"]]);
	});

	sock.on("newChat", (chat) => {
		console.log("Received a new chat");
		console.log(chat);
		addChat(chat);

		if (chat["_FROM"] in socketOf)
			socketOf[chat["_FROM"]].emit("newChatList", [chat]);
		if (chat["_TO"] in socketOf)
			socketOf[chat["_TO"]].emit("newChatList", [chat]);
	});

	sock.on("extractChatsBetn", (couple) => {
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
						sock.emit("newChatList", rows);
					}
				}
			);
		});
	});
});
