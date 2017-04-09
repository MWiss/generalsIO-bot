'use strict';

const io = require('socket.io-client');
const GeneralBot = require('./bot/general');
const readline = require('readline');
const colors = require('colors');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '>' });
const socket = io('http://botws.generals.io');

// Config variables
var game_mode; 								// Type of game we want to join
var custom_game_id; 					// Id of private server
var team_name; 								// Stores team name if 2v2 is selected
var username = '[Bot]MWAI';		// My bot name
var user_id; 									// Gets on connect
// Game variables
var chatRoom; 								// Chat room
var myBot; 										// The bot that plays the game
var replay_url; 							// The replay url
var cities = [];
var map = [];
// Other
var countDown = 5; 						// Used to count down before joining a game

socket.on('connect', () => {
	console.log('Connected to server.'.green);
	// Set the id for the bot.
	user_id = process.env.BOT_USER_ID;
	// This should only ever be done once. See the API reference for more details.
	socket.emit('set_username', user_id, username);

	// Once we connect, get the game mode
	console.log('Join:\n\t1 - 1v1\n\t2 - 2v2\n\t3 - FFA\n\t4 - Custom'.grey)
	rl.prompt();
});

socket.on('disconnect', () => {
	console.error('Disconnected from server.'.red);
	process.exit(1);
});

// Handles all the input for configuring bot start up
rl.on('line', (line) => {
	var input = line.trim();
	if (!game_mode) { // If we haven't set game mode
		game_mode  = input;
		if (game_mode == '2') {
      console.log('Set Team Name: '.grey);
			rl.prompt();
		} else if (game_mode == '4') {
			console.log('Set Custom Game ID: '.grey);
			rl.prompt();
		} else { // If no further input is required, start the game
			rl.close(); // We don't need read line anymore
			startGame();
		}
	} else if (game_mode == '2') { // If game mode is 2v2, set the team name
		team_name = input;
		rl.close(); // We don't need read line anymore
		startGame();
	} else if (game_mode == '4') { // If game mode is custom, set the game id
		custom_game_id = input;
		rl.close(); // We don't need read line anymore
		startGame();
	}
});

socket.on('game_start', (data) => {
	// Get ready to start playing the game.
	chatRoom = data.chat_room; // Used for chatting
	myBot = new GeneralBot(socket, data.chat_room, data.playerIndex); // Initialize the bot
	replay_url = 'http://bot.generals.io/replays/' + encodeURIComponent(data.replay_id);
	console.log('Game starting! The replay will be available after the game at ' + replay_url);

	// Send a greeting to players
	myBot.talk.getGreeting();
});

socket.on('game_update', (data) => {
	// Patch the city and map diffs into our local variables.
	cities = patch(cities, data.cities_diff);
	map = patch(map, data.map_diff);

	// The first two terms in |map| are the dimensions.
	var width = map[0];
	var height = map[1];
	var size = width * height;

	// The next |size| terms are army values.
	// armies[0] is the top-left corner of the map.
	var armies = map.slice(2, size + 2);

	// The last |size| terms are terrain values.
	// terrain[0] is the top-left corner of the map.
	var terrain = map.slice(size + 2, size + 2 + size);

	// Get the current round and turn
	var turn = Math.ceil(data.turn/2); // there are two mini-turns in each actually turn
	var round = Math.floor(turn/25); // each round has 25 turns
	// Update the bot
	myBot.update(cities, data.generals, width, height, armies, terrain, turn, round);
});

socket.on('game_lost', (data) => {
	myBot.talk.onLose();
	console.log("Game Lost!")
	console.log("Replay URL:" + replay_url)
	console.log(data);
	socket.emit('leave_game');
	startGame();
});

socket.on('game_won', (data) => {
	myBot.talk.onWin();
	console.log("Game Won!")
	console.log("Replay URL:" + replay_url)
	console.log(data);
	socket.emit('leave_game');
	startGame();
});



var startGame = function () {
	if (countDown) {
		if (countDown === 5) {
			console.log(("Joining Game in:\n" + countDown).magenta);
		} else {
			console.log(("" + countDown).magenta);
		}
		countDown--;
		setTimeout(() => { startGame(); }, 1000); // Delay one second
	} else {
		countDown = 5; // rest count down
		switch(game_mode) {
			case '1':
				console.log('Joined 1v1'.yellow);
				socket.emit('join_1v1', user_id);
				break;
			case '2':
				console.log(('Joined 2v2 as Team ' + team_name).yellow);
				socket.emit('join_team', team_name, user_id);
				break;
			case '3':
				console.log('Joined FFA'.yellow);
					socket.emit('play', user_id);
				break;
			case '4':
				console.log(('Joined Custom Game at http://bot.generals.io/games/' + encodeURIComponent(custom_game_id)).yellow);
				socket.emit('join_private', custom_game_id, user_id);
				socket.emit('set_force_start', custom_game_id, true);
				break;
			default:
				console.log('Invalid Game Mode');
				process.exit(1);
				break;
		}
	}
}

var patch = function (old, diff) {
 var out = [];
 var i = 0;
 while (i < diff.length) {
	 if (diff[i]) {  // matching
		 Array.prototype.push.apply(out, old.slice(out.length, out.length + diff[i]));
	 }
	 i++;
	 if (i < diff.length && diff[i]) {  // mismatching
		 Array.prototype.push.apply(out, diff.slice(i + 1, i + 1 + diff[i]));
		 i += diff[i];
	 }
	 i++;
 }
 return out;
}
