var io = require('socket.io-client');
var generalBot = require('./bot/GeneralBot.js');

var socket = io('http://botws.generals.io');

socket.on('disconnect', function() {
	console.error('Disconnected from server.');
	process.exit(1);
});

socket.on('connect', function() {
	console.log('Connected to server.');

	// Set user id and username
	var user_id = process.env.BOT_USER_ID;
	var username = 'SentientAI';

	// Set the username for the bot.
	// This should only ever be done once. See the API reference for more details.
	socket.emit('set_username', user_id, username);

	// Join a custom game and force start immediately.
	// Custom games are a great way to test your bot while you develop it because you can play against your bot!
	// var custom_game_id = 'testing';
	// socket.emit('join_private', custom_game_id, user_id);
	// socket.emit('set_force_start', custom_game_id, true);
	// console.log('Joined custom game at http://bot.generals.io/games/' + encodeURIComponent(custom_game_id));

	// Join the 1v1 queue.
	socket.emit('join_1v1', user_id);

	// Join the FFA queue.
	// socket.emit('play', user_id);

	// Join a 2v2 team.
	// socket.emit('join_team', 'team_name', user_id);
});

var chatRoom; // Chat room
var myBot; // The bot that plays the game
var replay_url;
socket.on('game_start', function(data) {
	// Get ready to start playing the game.
	chatRoom = data.chat_room; // Used for chatting
	myBot = new generalBot(socket, data.chat_room, data.playerIndex); // Initialize the bot
	replay_url = 'http://bot.generals.io/replays/' + encodeURIComponent(data.replay_id);
	console.log('Game starting! The replay will be available after the game at ' + replay_url);

	// Send a greeting to players
	socket.emit('chat_message', chatRoom, myBot.talk.getGreeting());
});

socket.on('game_update', function(data) {
	myBot.update(data);
});

socket.on('game_lost', function (data) {
	socket.emit('chat_message', chatRoom, myBot.talk.onLose());
	console.log("Game Lost!")
	console.log("Replay URL:" + replay_url)
	console.log(data);
	socket.emit('leave_game');
});

socket.on('game_won', function (data) {
	socket.emit('chat_message', chatRoom, myBot.talk.onWin());
	console.log("Game Won!")
	console.log("Replay URL:" + replay_url)
	console.log(data);
	socket.emit('leave_game');
});
