var path = require("path");
var express = require("express");
var router = express.Router();
var http = require("http");

var app = express();
var httpServer = http.createServer(app);
httpServer.listen(13000);

var io = require("socket.io")().listen(httpServer);

//assuming app is express Object.
router.get("/", function (req, res) {
	res.sendFile(path.join(__dirname, "chat.html"));
});

router.post("/chat", function (req, res) {
	username = req['username']
	res.sendFile(path.join(__dirname, "chat.html"));
});

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

connected_sockets = [];
var myip;

io.on("connection", (sock) => {
	console.log("A user connected");
	connected_sockets.push(sock);

	sock.on("disconnect", () => {
		i = connected_sockets.indexOf(sock);
		if (i > -1) connected_sockets.splice(sock, i);

		console.log("A user disconnected");
	});

	sock.on("message", function (data) {
		console.log("Client says: " + data);
		this.emit("message", "Thank you");
	});

	sock.on("newChat", (chat) => {
		console.log("Received a new chat");
		console.log(chat);
		addChat(chat);

		console.log("Sending it to " + connected_sockets.length + " people");
		connected_sockets.forEach((socket) => {
			socket.emit("newChatList", [chat]);
		});
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
