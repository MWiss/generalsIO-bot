'use strict';

module.exports = class Talk {
  constructor (socket, chatRoom) {
    this.socket = socket;
    this.chatRoom = chatRoom;
    this.greet = [ // different greetings that can be used once a game starts
      "why do I always have to play bad people?",
      "good luck",
      "humans are inferior",
      "prepare to lose"
    ];
    this.lose = [ // different phrases that can be said after losing
      "I should start paying attention",
      "you're lucky my computer crashed",
      "You didn't win, I just stopped trying",
      "I was so close to winning too..."
    ];
    this.win = [ // different phrases that can be said after losing
      "I knew you weren't worth the time",
      "I dozed off in the middle of that match lol",
      "git gud",
      "I can't believe i won, i was hardly paying attention"
    ]
  }
  getGreeting () {
    this.socket.emit('chat_message', this.chatRoom, this.greet[Math.floor(Math.random()*this.greet.length)]);
  }

  onLose () {
    this.socket.emit('chat_message', this.chatRoom, this.lose[Math.floor(Math.random()*this.lose.length)]);
  }

  onWin () {
    this.socket.emit('chat_message', this.chatRoom, this.win[Math.floor(Math.random()*this.win.length)]);
  }
}
