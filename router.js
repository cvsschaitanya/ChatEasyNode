const express = require("express");
const bcrypt = require("bcrypt");

var router = express.Router();

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

module.exports = router;
