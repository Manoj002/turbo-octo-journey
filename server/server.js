var express = require("express");
var bodyParser = require("body-parser");
var Pusher = require("pusher");

var app = express();
app.use(bodyParser.json());
app.use( bodyParser.urlencoded({ extended: false }) )

var pusher = new Pusher({  // connect to pusher
    appId: "***",
    key: "****",
    secret: "*******",
    cluster: "***"
})

app.get("/", function(req, res) {  // for testing if serveris running or not
    res.send("All is good...")
})

// for authenticating users
app.get("pusher/auth", function(req, res) {

    var query = req.query
    var socketId = query.socket_id;
    var channel = query.channel_name;
    var callback = query.callback;

    var auth = JSON.stringify(pusher.authenticate(socketId, channel));
    var cb = callback.replace(/\"/g,"") + "(" + auth + ")";

    res.set({
        "Content-Type": "application/javascript"
    });

    res.send(cb);
});

app.post("/pusher/auth", function(req, res) {
    var users = ["manoj"];
    var username = req.body.username;

    if(users.indexOf(username) !== -1 ){
        var socketId = req.body.socket_id;
        var channel = req.baseUrl.channel_name;
        var auth = pusher.authenticate(socketId, channel);
        res.send(auth);
    } else{
        return res.status(422).error(err);
    }
});

var port = process.env.PORT || 5000;
app.listen(port);

// Don’t forget to pass in the username 
// when connecting to Pusher on the client-side later on.

// deploy auth server
// url is here