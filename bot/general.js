'use strict';
const BotTalk = require('./talk.js');

// Terrain Constants.
// Any tile with a nonnegative value is owned by the player corresponding to its value.
// For example, a tile with value 1 is owned by the player with playerIndex = 1.
const TILE_EMPTY = -1;
const TILE_MOUNTAIN = -2;
const TILE_FOG = -3;
const TILE_FOG_OBSTACLE = -4; // Cities and Mountains show up as Obstacles in the fog of war.

// Bot constants
const COLLECT_RANGE = 3;
const DEFENSE_RANGE = 7;

/* GeneralBot
 * Describe plans of execution
 *
 */
module.exports = class GeneralBot {
  constructor(socket, chatRoom, playerIndex) {
    this.talk = new BotTalk(socket, chatRoom); // Add capability to emote
    this.socket = socket;
    this.chatRoom = chatRoom
    // Game data.
    this.playerIndex = playerIndex;
    this.generals; // The indicies of generals we have vision of.
    this.cities = []; // The indicies of cities we have vision of.
    this.map = [];
    this.turn = 0;
    this.round = 0;
    // Bot data
    this.citiesControlled = []; // THe indicies of the cities that we have captured, index 0 will always be a general
    this.deadEnds = []; // Stored indicies of unwanted tiles, ones that lead to dead ends
    this.startIndex = 0;
    this.endIndex = 0;
    this.behavior = "spread"; //spead, collect, explore
  }
  // Runs all the functions that occur every turn of the game
  update (cities, generals, width, height, armies, terrain, turn, round) {
    this.cities = cities
    this.generals = generals,
    this.width = width;
    this.height = height;
    this.armies = armies;
    this.terrain = terrain;
    this.turn = turn;
    this.round = round;
    // Run the event Manager
    this.eventManager();

    // Get and move an army
    this.startIndex = this.selectArmy();
    this.endIndex = this.moveArmy();
    console.log(this.behavior + " from " + this.getCoordString(this.startIndex) + " to " + this.getCoordString(this.endIndex));
    this.socket.emit('attack', this.startIndex, this.endIndex);
  }

  // Event Manager
  eventManager () {
    // log the round and turn of round
    console.log("round: " + this.round + ", turn: " + this.getTurnOfRound());
    // Collect every three rounds
    if (this.round % 3 && this.getTurnOfRound() === 0.5) {
      this.behavior = "collect";
    }
    switch (this.round) {
      case 1:
        if (this.getTurnOfRound() === 0.5) { //0.5 is technically the first turn
          // The first two terms in |map| are the dimensions.
          this.width = this.map[0];
          this.height = this.map[1];
          this.size = this.width * this.height;
          // Set the home base as the current base
          this.generals.forEach( function(general) {
            if (general != -1) {
              this.citiesControlled.push(general);
            }
          }, this)
          // set the starting behvaior to spread
          console.log("Spread!")
          this.behavior = "spread";
        }
        break;
    }
  }

  // Selectes that army to work with based on behavior
  selectArmy () {
    var armyIndex = -1;
    switch (this.behavior) {
      case "spread":
        armyIndex = this.getArmyLargest(this.getArmies());
        break;
      case "collect":
        armyIndex = this.getArmyNearestFarthest(this.getArmiesInRange(this.getArmiesOfSize(this.getArmies(), 3, true), COLLECT_RANGE, this.citiesControlled[0]), this.citiesControlled[0], false);
        break;
    }
    return armyIndex
  }

  // Moves the army
  moveArmy () {
    var endIndex = -1;
    // Will flesh this function out later
    switch (this.behavior) {
      case "spread":
        // If we are large enough, get a city, otherwise, continue exploring
        var uncapturedCities = this.getUncapturedCities();
        if (uncapturedCities.length > 0) {
          // Get the nearest uncaptured city
          var targetCity = this.getNearestCity(uncapturedCities, this.startIndex);
          // If there are enough troops to move and take it over, do so
          if (this.armies[this.startIndex] - this.getDistance(targetCity, this.startIndex) - 1 > this.armies[targetCity]) {
            console.log("Taking Ciy: " + this.getCoordString(targetCity));
            endIndex = this.armyTowards(targetCity, this.startIndex);
          }
        }
        // If we are not getting a city, spread
        if (endIndex === -1) {
          endIndex = this.armySpread(this.citiesControlled[0], this.startIndex);
        }
        break;

      case "collect":
        console.log("Collect to city: " + this.getCoordString(this.citiesControlled[0]));
        endIndex = this.armyTowards(this.citiesControlled[0], this.startIndex);
        if (!endIndex) {
          console.log("Explore!");
          endIndex = this.armySpread(this.citiesControlled[0], this.startIndex);
          this.behavior = "spread";
        }
        break;
    }
    return endIndex
  }

  /* A function that moves randomly selected armies within a range around a index
   * so that they spread out, prioritizing empty space
   * from - the index to move away from
   * army - the current amry we have select
   */
  armySpread (from, army) {
    var originalDist = this.getDistance(from, army);
    var indicies = this.getNeighbors(army); // get the surrounding tiles
    var movementOptions = [];
    var newTiles = 0;
    // loop through possible options
    indicies.forEach(function(moveIndex) {
      // if a new tile has been unclaimed
      if (this.checkEmpty(army, moveIndex)) {
        movementOptions.unshift(moveIndex);
        newTiles++;
      // else move a army away from the desired index
      } else if (this.checkMoveable(army, moveIndex) && this.getDistance(from, moveIndex) > originalDist) {
        movementOptions.push(moveIndex);
      }
    }, this);
    // return the first movement option
    if (movementOptions.length > 0) {
      // If we have new tiles, get those first, otherwise, get a random visited one
      return newTiles ? movementOptions[Math.floor(Math.random()*newTiles)]: movementOptions[Math.floor(Math.random()*movementOptions.length)];
    } else {
      // Add tile to list of dead ends
      this.deadEnds.push(army);
      // Move the army back, this is a dead end
      //return this.armyTowards (from, army);
    }
  }

  // Move army towards an index
  armyTowards (to, army) {
    return this.shortestPath(army, (index) => index === to)[0];
  }

  //Gets the nearest city to and index
  getNearestCity (cities, index) {
    var nearestCity = -1;
    var smallestDist = Infinity;
    cities.forEach(function(city) {
      // Get distance of city to index
      var dist = this.getDistance(city, index);
      if (dist < smallestDist) {
        smallestDist = dist;
        nearestCity = city;
      }
    }, this)
    return nearestCity;
  }

  getUncapturedCities () {
    var uncapturedCities = [];
    this.cities.forEach(function(city) {
      // If we don't own it, push it
      if (this.terrain[city] !== this.playerIndex) { uncapturedCities.push(city); }
    }, this)
    return uncapturedCities;
  }

  /*Returns a list of all armies
  * if owned is true, get only my armies,
  * otherwise, get all other armies that aren't mine/enemies
  */
  getArmies (owned=true) {
    var resultArmies = [];
    this.armies.forEach(function(army, i) {
      var tile = this.terrain[i];
      if (owned && tile === this.playerIndex) { resultArmies.push(i); } // Gets my armies
      else if (tile >= 0 && tile !== this.playerIndex) { resultArmies.push(i); } // Gets enemy armies
    }, this)
    return resultArmies;
  }

  // Gets armies that are at least a certian size
  getArmiesOfSize (armies, size, noCity=false) {
    var armiesOfSize = [];
    armies.forEach(function(army) {
      if (noCity && this.isCity(army)) { return; } // If the index is a city and noCity is true, don't add to list
      if (this.armies[army] >= size) { armiesOfSize.push(army); }
    }, this)
    return armiesOfSize;
  }

  // Gets the largest army
  getArmyLargest (armies, noCity=false) {
    var size = 0;
    var maxArmy = 0; // set to homebase just in case
    armies.forEach(function(army) {
      if (noCity && this.isCity(army)) { return; } // If the index is a city and noCity is true, don't add to list
      // Make sure it is in our army and is larger than previous
      if (this.armies[army]  > size) {
        size = this.armies[army];
        maxArmy = army;
      }
    }, this);
    return maxArmy;
  }

  // returns list of armies in a range next to index
  getArmiesInRange (armies, range, index, noCity=false) {
    var armiesInRange = [];
    armies.forEach(function(army) {
      if (noCity && this.isCity(army)) { return; } // If the index is a city and noCity is true, don't add to list
      if (this.getDistance(army, index) <= range) { armiesInRange.push(army); }
    }, this)
    return armiesInRange;
  }

  // Gets the near/far army to index
  getArmyNearestFarthest (armies, index, near=true, noCity=false) {
    var savedDistance = near ? Infinity : 0;
    var resultArmy = -1; // set to homebase just in case
    armies.forEach(function(army) {
      if (noCity && this.isCity(army)) { return; } // If the index is a city and noCity is true, don't add to list
      // Make sure it is in our army and is larger than previous
      var dist = this.getDistance(army, index);
      if (near && dist <= savedDistance) { // get the nearest
        savedDistance = dist;
        resultArmy = army;
      } else if (dist >= savedDistance) { // get the furthest
        savedDistance = dist;
        resultArmy = army;
      }
    }, this);
    return resultArmy;
  }

  /* Written by Kristopher Brink
   * https://github.com/kpgbrink/generalsIO_Bot_KPG/blob/master/imov.js
   * performs check to see if moving to an index is possible
   * returns false if tile is dead end
   */
  checkMoveable (from, to) {
    return this.checkMoveableReal(from, to)
    && !this.isDeadEnd(to);
  }

  /* Written by Kristopher Brink
   * https://github.com/kpgbrink/generalsIO_Bot_KPG/blob/master/imov.js
   * performs check to see if moving to an index is possible
   */
  checkMoveableReal (from, to) {
    return this.checkInsideMap(from, to)
    && this.checkCityTakeable(from, to)
    && !this.isMountain(to);
  }

  // Checks if tile is only empty, no players, city, or mountian
  checkEmpty (from, to) {
    return this.checkInsideMap(from, to)
    && this.isEmpty(to);
  }


  // checks to see if a city is takeable
  checkCityTakeable (army, index) {
    this.cities.forEach(function(city) {
      // if the index is actually a cilistentoty
      if (city === index) {
        // return false if our army is too small
        return this.armies[army]-1 > this.armies[city];
      }
    }, this)
    return true;
  }

  // Checks to see if tile is empty
  isEmpty (index) {
    return ((this.terrain[index] === TILE_EMPTY) && (!this.isCity(index)));
  }

  // Checks for a mountain at index
  isMountain (index) {
    return (this.terrain[index] === TILE_MOUNTAIN);
  }

  // Check if index is a city
  isCity (index) {
    return (this.cities.indexOf(index) != -1);
  }

  // Checks to see if tile is in dead end list
  isDeadEnd (index){
    return (this.deadEnds.indexOf(index) != -1);
  }
  // Gets the distance between two indicies
  getDistance (from, to) {
    // Calculate number of moves it takes to reach destination
    return Math.abs(this.getRow(from) - this.getRow(to)) + Math.abs(this.getCol(from) - this.getCol(to));
  }

  // Gets the column that an index is in
  getCol (index) {
    return index % this.width;
  }

  // Gets the row that the index is in
  getRow (index) {
    return Math.floor(index/this.width);
  }

  /* Written by Kristopher Brink
   * https://github.com/kpgbrink/generalsIO_Bot_KPG/blob/master/imov.js
   * gets the neighbors of an index
   */
  getNeighbors(i) {
    return [
      i + 1,
      i - 1,
      i + this.width,
      i - this.width,
    ].filter(potentialNeighbor => this.checkInsideMap(i, potentialNeighbor));
  }

  /* Written by Kristopher Brink
   * https://github.com/kpgbrink/generalsIO_Bot_KPG/blob/master/imov.js
   * checks to see if the a line between points is on the map
   */
  checkInsideMap (from, to) {
    // check if goes over
      const fromRow = this.getRow(from);
      const toRow = this.getRow(to);

      if (Math.abs(from-to) == 1) {
          return toRow == fromRow;
      }
      if (Math.abs(from-to) == this.width) {
          return toRow >= 0 && toRow < this.height;
      }
      throw new Error(`Assertion that ${to} (${this.getCoordString(to)}) is a neighbor of ${from} (${this.getCoordString(from)}) failed (fromRow=${fromRow}, toRow=${toRow})`);
  }

  // Send index to a string
  getCoordString (index) {
    return `<${this.getCol(index)}, ${this.getRow(index)}>`;
  }

  getTurnOfRound () {
    // Each turn displayed in game has two sub-turns
    return this.turn - (this.round*25);
  }
  /** Written by Nathan Brink
   * https://github.com/kpgbrink/generalsIO_Bot_KPG/blob/master/imov.js
   * Returns an array indicating the positions to move to to get to b.
   * Excludes a and includes b. If there is no path between these locations
   * or b is otherwise inaccessible, returns null.
   *
   * isTarget: function(index, distance): returns true if the passed index is the target.
   *
   * options:
   * - test function (a, b): returns true if the move is allowed. Defaults to checking checkMoveableReal
   * - visit function (i, distance): passed an index and its distance from a. Called for a.
   */
  shortestPath (a, testTarget, options) {
      options = Object.assign({
          test: (from, to) => this.checkMoveableReal(from, to),
          visit: (i, distance) => {},
      }, options);
      if (testTarget(a)) {
          options.visit(a, 0);
          return [];
      }

      const pathArray = new Array(this.terrain.length);
      // Mark your original location as -1.
      pathArray[a] = -1; // -1 means source
      // Initialize queue to contain the initial node.
      const nextQ = [{ index: a, distance: 0, }];

      // While there are things in the Q, process it.
      while (nextQ.length) {
          const visiting = nextQ.shift();
          options.visit(visiting.index, visiting.distance);

          // Check if what we're visiting is the target.
          if (testTarget(visiting.index, visiting.distance)) {
              // We found the target! Trace back to origin!
              const path = [];
              for (let previous = visiting.index; previous !== -1; previous = pathArray[previous]) {
                  path.unshift(previous);
              }
              // Remove a from the path.
              path.shift();
              console.log('found path', path);
              return path;
          }

          // Mark all unvisited visitable neighbors of this node
          // as being most quickly accessed through the node we're
          // visiting. Do not walk into mountains.
          for (const neighbor of this.getNeighbors(visiting.index).filter(i => options.test(visiting.index, i))) {
              if (pathArray[neighbor] !== undefined) {
                  // This neighbor has been visited already. Skip.
                  continue;
              }

              // Mark the neighbor's source as our visiting node and
              // add to the nextQ.
              pathArray[neighbor] = visiting.index;
              nextQ.push({
                  index: neighbor,
                  distance: visiting.distance + 1,
              });
          }
      }
      return null;
  }
}
