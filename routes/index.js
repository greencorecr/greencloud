 'use strict';
/* 
   Dependencies
*/
var passport = require('passport'),
	request = require('request'),
	User = require('../models/User'),
	Sequence = exports.Sequence || require('sequence').Sequence;
/* 
   Cloudflare acount information.
   - the key is in the acount's settings
*/
var	email = 'user@example.com',
	key = 'c2547eb745079dac9320b638f5e225cf483cc5cfdda41';

/* 
   Global variables
*/
var arrayDomains, // store the loaded domains.
	arrayDNS; // store the loaded dns. 
0

module.exports = function(app, io) {

/*	
	Redirect to the index 
*/
	app.get('/', function (req, res) {
		res.render("index");
	});

/*
	Signup users with passport strategy predefine in /config/passport.js
*/
    app.post('/signup', passport.authenticate('signup', {
        successRedirect : '/desk', // redirect to the secure profile section
        failureRedirect : '/', // redirect back to the signup page if there is an error
        failureFlash : true // allow flash messages
    }));

/*
	Log in users with passport strategy predefine in /config/passport.js,
	and redirect the users depending on their type
*/
	app.post('/login', passport.authenticate('login', 
			{
				failureRedirect: '/', 
				failureFlash: 'Invalid username or password'
			}),
		function(req, res) {
	        req.session.name = req.user.type;
	        if (req.session.name == "User") {
	            res.redirect('/desk');
	        }
	        if (req.session.name == "Admin") {
	            res.redirect('/admin');
	        }
		}
	);

/*
	Get the domains assign to the user from mongo, and send them to desk.jade
*/
	app.get('/desk', isLogIn, function(req, res) {
		User.findById({_id:req.user.id}).sort({'name': -1}).exec(function(err, user){
			res.render("desk", {
				user: user,
				domains: user.domains
			});	
		});//User
	});

/*
	Get the users form mongo, the domains from cloudflare and send them to admin.jade
*/
	app.get('/admin', isLogIn, function(req, res) {
		User.find({type: "User"}).exec(function(err, users){
			var options = {
				url: 'https://api.cloudflare.com/client/v4/zones?order=name&direction=asc&match=all&per_page=100',
				headers: {
					'Content-Type': 'application/json',
					'X-Auth-Key': key,
					'X-Auth-Email': email
				}
			}
				request(options,function (error, response, body) {
				  	if (!error) {
						//  Turn the body to json object
				  		var dns = JSON.parse(body);
						arrayDomains = dns.result;
						res.render("admin", {
							user: req.user,
							domains: arrayDomains,
							users: users
						});	
					} else {
						console.log('error: '+ error);
					}
				});//request
		});//User
	});

/*
	List the DNS records from one zone.
*/
	app.get('/zone/:id', isLogIn, function(req, res) {
		User.findById({_id:req.user.id}).exec(function(err, user){
			var domain = req.params.id;
			var split = domain.split(",");
			var zone = {
					id: split[0],
					name: split[1]
			}
			var options = {
				url: 'https://api.cloudflare.com/client/v4/zones/' + zone.id + '/dns_records?per_page=100',
				headers: {
					'Content-Type': 'application/json',
					'X-Auth-Key': key,
					'X-Auth-Email': email
				}
			}
			request(options,function (error, response, body) {
			  	if (!error) {
					//  Turn the body to json object
			  		var dns = JSON.parse(body);
					arrayDNS = dns.result;
					
					//  create a short name for the dns.
					for (var i = 0; i < arrayDNS.length; i++) {
						var split = arrayDNS[i].name.split('.');
						arrayDNS[i].nameShort = arrayDNS[i].name.substr(0, arrayDNS[i].name.length - (zone.name.length + 1));
					};
					res.render("dnsList", {
						user: req.user,
						DNSs: arrayDNS,
						zone: zone,
						domains: user.domains
					});	
				} else {
					console.log('error: '+ error);
				}
			});//request
		});//User
	});

/*
	Log out the users
*/
	app.get('/logout',isLogIn, function(req, res) {
        req.logout();
        res.redirect('/');
    });

/*
	Create users on mongo
*/
	app.post('/addUser',isLogIn, function(req, res) {
		var arrayDomainsUser = [];
		var split;
		if(req.body.domains instanceof Array){
            for( var i in req.body.domains){
            	split = req.body.domains[i].split(",");
                arrayDomainsUser.push({domain: split[0], name: split[1]}); 
            }
        } else {
        	split = req.body.domains.split(",");
            arrayDomainsUser.push({domain: split[0], name: split[1]});
        }
		// if there is no user with that username
		// create the user
		var newUser = new User();

		// set the user credentials
		newUser.username = req.body.username;
		newUser.password = User.generateHash(req.body.password);
		newUser.domains  = arrayDomainsUser;
		
		// save the user
		newUser.save(function(err) {
		    if (err)
		        throw err;
		});
		res.redirect('/admin'); 
    });

/*
    Delete users from mongo
*/
    app.get('/deleteUser/:id', isLogIn, function(req, res) {
        var userId = req.params.id;
        User.findByIdAndRemove(userId, function(error, empleados) { 
            if (error) return res.json(error);
            res.redirect('/admin');
        });
    });

/*
    Load user's information and send the information to the client socket
*/
    app.get('/loadUser', isLogIn, function(req, res) {
        var userId = req.query.id;
        User.findById(userId, function(error, user) { 
            if (error) return res.json(error);
            res.json(user);
        });
    });

/*
    Update users from mongo
*/
    app.post('/updateUser/:id', isLogIn, function(req, res) {
        var userId = req.params.id;

        var arrayDomainsUser = [];
		var split;
		if(req.body.domains instanceof Array){
            for( var i in req.body.domains){
            	split = req.body.domains[i].split(",");
                arrayDomainsUser.push({domain: split[0], name: split[1]}); 
            }
        } else {
        	split = req.body.domains.split(",");
            arrayDomainsUser.push({domain: split[0], name: split[1]});
        }

        var user = {};
        user.username = req.body.username;
        user.domains  = arrayDomainsUser;

        User.findByIdAndUpdate(userId, user, function(error, user) { 
            if (error) return res.json(error);
            res.redirect('/admin');
        });
    });

/*
    Change the user's password
*/
    app.post('/changePassword/:id', isLogIn, function(req, res) {
        var userId = req.params.id;

        var user = {};
        user.username = req.body.username;
        user.password = User.generateHash(req.body.password);

        User.findByIdAndUpdate(userId, user, function(error, user) { 
            if (error) return res.json(error);
            if (req.session.name == "User") {
	            res.redirect('/desk');
	        }
	        if (req.session.name == "Admin") {
	            res.redirect('/admin');
	        }
	    });
    });

/*
	Verify if the user is logged in
*/
	function isLogIn (req, res, next) {
		// if user is authenticated in the session, call the next() to call the next request handler 
		// Passport adds this method to request object. A middleware is allowed to add properties to
		// request and response objects
		if (req.isAuthenticated()){
			console.log('Is log In')
			return next();
		}
		console.log('Is NOT log In')
		// if the user is not authenticated then redirect him to the login page
		res.redirect('/');
	}

/*
	Connect the socket of the server with the client
*/
	io.sockets.on('connection', function(socket){

	/*
		Get the data from the client side and SAVE the DNS record to one zone on Cloudflare
	*/
		socket.on('add', function(data){
			var options = {
 				method: 'post',
				url: 'https://api.cloudflare.com/client/v4/zones/' + data.zone + '/dns_records',
				headers: {
					'Content-Type': 'application/json',
					'X-Auth-Key': key,
					'X-Auth-Email': email
				},
				body: data.data,
 				json: true
			};

			var sequence = Sequence.create();
			
			sequence
			    .then(function (next) {
			    	request(options, function (err, res, body) {
						if (err) console.log(err + 'error posting json');
						console.log("status: " + res.statusCode);
						if(!err && res.statusCode != 200){
							next(body.errors)
						}
					});
			    })
			    .then(function (next, errors) {
			    	/*
			    		Send the error to the client side 
			    	*/
			    	/*io.sockets.on('connection', function(socket){
				    	console.log(errors);
				    	socket.emit('errors', errors);
				    });*/
			    	//notify(errors);
			    });

		});

	function notify(errors) {
		socket.emit('notify', errors);
	}

	/*
		Send the data to the client side
	*/
		socket.on('getDNS', function (dnsId) {
	        for (var i = 0; i < arrayDNS.length; i++) {
	        	if(arrayDNS[i].id === dnsId){
	        		socket.emit('dnsRecord', arrayDNS[i]);
		        }
	        };
	    });

	/*
		Get the new data from the client side and UPDATE a DNS record to Cloudflare
	*/
		socket.on('update', function (dnsData) {
	        var fecha = new Date();
	        for (var i = 0; i < arrayDNS.length; i++) {
	        	if(arrayDNS[i].id === dnsData.id){
	        		//set the request with the actual information
			        var options = {
 						method: 'put',
						url: 'https://api.cloudflare.com/client/v4/zones/' + arrayDNS[i].zone_id + '/dns_records/' + dnsData.id,
						headers: {
							'Content-Type': 'application/json',
							'X-Auth-Key': key,
							'X-Auth-Email': email
						},
						body: {
							'id': dnsData.id,
							'type': arrayDNS[i].type,
							'name': dnsData.name,
							'content': dnsData.content,
							'proxiable': arrayDNS[i].proxiable,
							'proxied': arrayDNS[i].proxied,
							'ttl': parseInt(dnsData.ttl),
							'locked': arrayDNS[i].locked,
							'zone_id': arrayDNS[i].zone_id,
							'zone_name': arrayDNS[i].zone_name,
							'created_on': arrayDNS[i].created_on,
							'modified_on': fecha.toISOString(),
							'data': {}
						},
 						json: true
					} 

					if(arrayDNS[i].type == 'MX'){
						options.body.priority = dnsData.priority;
					}

					request.put(options,function (error, response) {
					  	if (error) {
					  		console.log('error: '+ error);
						}
					});//request
		        }
	        };
	    });

	/*
		Get the dns's id from the client side and delete a DNS record from Cloudflare.
	*/
		socket.on('delete', function (dnsId){
	        var options = {
				url: 'https://api.cloudflare.com/client/v4/zones/' + dnsId.zone + '/dns_records/' + dnsId.id,
				headers: {
					'Content-Type': 'application/json',
					'X-Auth-Key': key,
					'X-Auth-Email': email
				}
			} 
			request.del(options,function (error, response, body) {
			  	if (error) console.log('error: '+ error);
				else socket.emit('reload');
			});//request
	    });

	});
}
