var express = require('express');
var rbxJs = require('roblox-js');
var https = require('https');
var router = express.Router();

var ranks = [10, 20, -1, 35, 50, 65, 80, 100, 125];
var groupId = 1174414;
var apiKey = "1IJBk5TxgeUSHd3NPtBoiN9LbaxMuXi1QkoCLz8HtsyN8O4wng2cP0Ftfp6Z";
var updating = false

function GetEXPFromLevel(level) {
	return level > 1
	? level
	: 0;
}

function GetLevelFromEXP(exp) {
	return exp >= GetEXPFromLevel(2)
	? Math.floor(exp)
	: 1;
}

function updateGroupRankings() {
	if (updating) {
		return;
	}

	updating = true;

	console.log("Updating Group " + groupId + " Rankings @ " + new Date());

	var changes = {};
	var playersComplete = 0;

	function errorHandler(error, errorId) {
		result = "ERROR " + errorId + ", " + error;
		console.log(result);
	}

	function setRank(id, name, rnew, rold, rname) {
		console.log("Setting the rank of " + name + " from " + rold + " to " + rnew);
		changes[id] = (rnew > rold ? "Promotion" : "Demotion") + ": " + rold + "=>" + rnew;

		rbxJs.setRank({
			group: groupId,
			target: id,
			rank: rnew
		}).then(function() {
			console.log("Successfully ranked " + name);

			if (rnew > rold) {
				console.log("Sending message to " + name + " to congratulate them on their promotion.");

				rbxJs.message({
					recipient: id,
					subject: "[PROMO] The Nighthawk Imperium",
					body: "Congratulations " + name + "! You have been promoted to " + rname + "! Please continue to serve us well in duty and be active.\n\nBe sure to message any high ranks if you have questions.",
				}).then(function() {
					console.log("Message successfully sent to " + name);
				}).catch(errorHandler);
			}
		}).catch(errorHandler);
	}

	function noChange(id) {
		//console.log("Player " + id + " requires no rank change.");
	}

	function logChangesToDoc() {
		var postData = JSON.stringify(changes);
		var post = https.request({
			hostname: "script.google.com",
			path: "/macros/s/AKfycbxTJ7YjbeHxfEOD8MIcfqXzUvHGRvXcc_tsXOg-ponntqoZEdte/exec",
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Content-Length": Buffer.byteLength(postData)
			}
		});

		post.write(postData);
		post.end();
	}

	rbxJs.getRoles({
		group: groupId
	}).then(function(roles) { //Data [{"ID":number,"Name":"string","Rank":number}, ...]

		//Get the data of the highest rank obtainable by EXP
		var highestPromoRank = roles[ranks.length];

		console.log(highestPromoRank);

		//Add in the data that specifies the EXP requirement to reach that rank to the data of each role in roles
		for (var index in roles) {
			roles[index].PromoEXP = ranks[index - 1] == -1 ? -1 : GetEXPFromLevel(
				index == 0 ? 0 : ranks[index - 1]
			);
		}

		console.log(roles);

		https.get( //Get the data of each player and their EXP
			"https://api.myjson.com/bins/12q2x7",

			function(res) {
				res.on('data', function(data) {

					data = JSON.parse(data.toString());

					console.log(data);

			  		rbxJs.getPlayers({
						group: groupId
					}).then(function(players) {
						players = players.players;

						var numPlayers = players.length;

						for (var playerIndex of players) {
							(function(playerIndex) {
								var userName = playerIndex.name;
								var userId = parseInt(playerIndex.id);

								var rank = playerIndex.parent.role.Rank; //number
								var followingRank = roles[playerIndex.parent.rankIndex + 1];

								if (followingRank && followingRank.PromoEXP == -1) {
									console.log("Manual intervention required for this player to rise to " + followingRank.Name);
								} else if (rank <= highestPromoRank.Rank) { //if rank is less than or equal to the highest promo rank, this person is not exempt from the ranking system
									var exp = data[userId.toString()]; //exp in numerical form

									if (typeof exp == "number") { //if exp exists
										for (var index in roles) { //iterate through the roles in the group from least to owner
											var PromoEXP = roles[index].PromoEXP; //get exp required to be that role
											if (typeof PromoEXP == "number") { //check to see if the required exp is a number
												if (Math.min(exp, PromoEXP) == exp) { //if the player's exp is less than the exp required to promote
													if (exp == PromoEXP && rank != roles[index].Rank) { //if the exp is the same as the promo exp and the player is not that rank
														setRank(userId, userName, roles[index].Rank, rank, roles[index].Name); //rank him there
													} else if (exp != PromoEXP && rank != roles[index - 1].Rank) { //otherwise if the exp is actually less than the requirement to be promoted
														setRank(userId, userName, roles[index - 1].Rank, rank, roles[index - 1].Name); //promote him to the rank before
													} else {
														noChange(userId); //otherwise there is no change
													}
													break;
												} else if ( //if the player's exp is not less than the exp required to promote but this is the last part to promote and theyre not exempt from the ranking system
													roles[index] === highestPromoRank &&
													highestPromoRank.PromoEXP <= exp &&
													highestPromoRank.Rank != rank
												)
												{
													setRank(userId, userName, highestPromoRank.Rank, rank, highestPromoRank.Name); //promote that person
													break;
												} else {
													noChange(userId); //otherwise there is no change
												}
											}
										}
									} else if (rank != roles[0].Rank) { //if exp is not a number, which means they have no exp, then set their rank to the bottom
										setRank(userId, userName, roles[0].Rank, rank, roles[0].Name);
									} else {
										noChange(userId); //else no change
									}
								} else { //if theyre rank is higher than the highest possible rank then they are exempt from promotions / demotions
									console.log(userName + " is exempt from Promotions/Demotions.");
								}

								playersComplete++; //increment to show that this player has been processed through the ranking procedure

								if (playersComplete == numPlayers) { //if all the players have been processed then log any changes to the google document
									updating = false;
									logChangesToDoc();
									console.log(updating);
								}
							})(playerIndex);
						}
					}).catch(errorHandler);
			  	});
			}
		).on('error', function(e) {
			console.error(e);
		});
	}).catch(errorHandler);
}

function loginToAdministrator(){
	console.log("Logging into FriendlyTNIGuy...");

	rbxJs.login({
	  username: 'FriendlyTNIGuy',
	  password: 'SECURE_TNI_System12'
	}).then(function(info) {
	    console.log('Permissions Accessed');
	    console.log('Commencing Ranking System & Awaiting Calls from rbx.irontechnologies@gmail.com');

	    router.get('/update', function(req, res) {

	    	if (req.query.apiKey == apiKey) {
				https.get('https://api.myjson.com/bins/20wqi', function(res) {
					console.log('statusCode:', res.statusCode);
					console.log('headers', res.headers);

					res.on('data', function(data){
						var now = new Date();
						var time = JSON.parse(data.toString()).time;

						if (typeof time == "number" && now.getTime() - time >= 3600000) {
							var postData = JSON.stringify({
								"time": now.getTime()
							});

							var post = https.request({
								hostname: "api.myjson.com",
								path: "/bins/20wqi",
								method: "PUT",
								headers: {
									"Content-Type": "application/json",
									"Content-Length": Buffer.byteLength(postData)
								}
							});

							post.write(postData);
							post.end();

							updateGroupRankings();
						} else {
							console.log(time, now.getTime())
						}
					});
				}).on('error', function(e) {
					console.log("Could not retrieve time of last request");
					console.log(e);
				});
	    	} else {
	    		console.log(req.query.apiKey);
	    	}
	    });

	    updateGroupRankings();
	}).catch(function(e) {
		console.log('Permissions Denied');
		console.log(e);
	});
}

router.get("/getManualRankings", function(req, res) {
	var data = {Indexes: []};

	for (var i = 0; i < ranks.length; i++) {
		if (ranks[i] == -1) {
			data.Indexes.push(i + 1);
		}
	}

	res.json(data);
})

console.log("Setup Complete.");
loginToAdministrator();

module.exports = router;
