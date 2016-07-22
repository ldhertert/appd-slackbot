var Botkit = require('botkit')
var AppDynamics = require("./appdynamics.js");

var token = process.env.SLACK_TOKEN

var controller = Botkit.slackbot({
  // reconnect to Slack RTM when connection goes bad
  retry: Infinity,
  debug: false
})

// Assume single team mode if we have a SLACK_TOKEN
if (token) {
  console.log('Starting in single-team mode')
  controller.spawn({
    token: token
  }).startRTM(function (err, bot, payload) {
    if (err) {
      throw new Error(err)
    }

    console.log('Connected to Slack RTM')
  })
// Otherwise assume multi-team mode - setup beep boop resourcer connection
} else {
  console.log('Starting in Beep Boop multi-team mode')
  require('beepboop-botkit').start(controller, { debug: true })
}

controller.on('bot_channel_join', function (bot, message) {
  bot.reply(message, "I'm here!")
})

var appDynamics = null;

function initAppD(bot, message) {
  var askControllerHost = function(response, convo) {
      convo.ask('What is the host for your controller? (example: something.saas.appdynamics.com)', function(response, convo) {
        askUsername(response, convo);
        convo.next();
      }, { key: 'controllerHost' });
    }
    askUsername = function(response, convo) {
      convo.ask('What is the username for your controller? (example: someuser@customer1)', function(response, convo) {
        askPassword(response, convo);
        convo.next();
      }, { key: 'controllerUsername'});
    }
    askPassword = function(response, convo) {
      convo.ask('What is the password for your controller?', function(response, convo) {
        convo.next();
      }, { key: 'controllerPassword' });
    }

    bot.startConversation(message, function (err, convo) {
      convo.on('end',function(convo) {
          if (convo.status=='completed') {
            var res = convo.extractResponses();
            var host  = convo.extractResponse('controllerHost');
            //var root = "http://" + host + "/controller";
            var root = "http://demo1.appdynamics.com/controller";
            var username = convo.extractResponse('controllerUsername');
            var password = convo.extractResponse('controllerPassword');
            appDynamics = new AppDynamics(root, username, password);      
            convo.say('All set! Please try the previous command again.');          
          } else {
            // something happened that caused the conversation to stop prematurely
          }
        });
        askControllerHost(null, convo);
    });
}


controller.hears([/status of (.*)/i, /going on with (.*)/i, /whats up with (.*)/i], 'direct_message,direct_mention,mention', function(bot, message) {
    if (!appDynamics) return initAppD(bot, message);

    appDynamics.getOpenIncidents(message.match[1].replace("?", ""))  
        .then(function (incidents) {
            console.log(incidents);
            bot.reply(message, incidents);
        }) 
        .catch(function() {
            bot.reply(message, 'Sorry, something went wrong.'); 
        });    
});

controller.hears(['status2'], 'direct_message,direct_mention,mention', function(bot, message) {
    if (!appDynamics) return initAppD(bot, message);
  
    appDynamics.getOpenIncidents2()  
        .then(function (incidents) {
            incidents.forEach(function (incident) {
              var attachments = [{
                fallback: incident.description,
                pretext: 'We bring bots to life. :sunglasses: :thumbsup:',
                title: incident.severity + ": " + incident.name + " violation on " + incident.appDynamics,
                image_url: 'https://storage.googleapis.com/beepboophq/_assets/bot-1.22f6fb.png',
                title_link: incident.deepLinkUrl,
                text: incident.description,
                color: '#7CD197'
              }];

              bot.reply(message, {
                attachments: attachments
              });
            });
        }) 
        .catch(function() {
            bot.reply(message, 'Sorry, something went wrong.'); 
        });    
});


controller.hears(['status', 'going on', 'whats up'], 'direct_message,direct_mention,mention', function(bot, message) {
    if (!appDynamics) return initAppD(bot, message);
  
    appDynamics.getOpenIncidents()  
        .then(function (incidents) {
            bot.reply(message, incidents);
        }) 
        .catch(function() {
            bot.reply(message, 'Sorry, something went wrong.'); 
        });    
});


controller.hears(['applications'], 'direct_mention,direct_message,mention', function (bot, message) {
   if (!appDynamics) return initAppD(bot, message);
  
   appDynamics.getApplications()
    .map(function (app) {
          return app.name;
      })
      .then(function (applications) {
          bot.reply(message, applications.join(', '));
      })
      .catch(function() {
        bot.reply(message, 'Sorry, something went wrong.'); 
      });
});

controller.hears([/response time for (.*) in (.*)/i], 'direct_mention,direct_message,mention', function (bot, message) {
    if (!appDynamics) return initAppD(bot, message);

    appDynamics.getBTsForApplication(message.match[2].replace("?", ""))
      .then(function (bts) {
          var matches = bts.filter(function (bt) {
              return bt.name.match(new RegExp("^" + message.match[1] + "$", "i"));
          });
          if (matches.length === 0) {
              bot.reply('Could not find BT named ' + btName);
          } if (matches.length === 1) {
              return matches[0];
          } else {
              return matches[0];
          }
      })
      .then(function (bt) {
          return appDynamics.getMetricsForBT(message.match[2].replace("?", ""), bt.tierName, bt.name);
      })
      .then(function (metrics) {
          return bot.reply(message, 'The average response time for ' + message.match[1] + ' is ' + metrics.responseTime + "ms.");        
      })
      .catch(function(err) {
        bot.reply(message, 'Sorry, something went wrong.'); 
        console.log('Error', err);
      });
});

/*
controller.hears(['hello', 'hi'], ['direct_mention'], function (bot, message) {
  bot.reply(message, 'Hello.')
})

controller.hears(['hello', 'hi'], ['direct_message'], function (bot, message) {
  bot.reply(message, 'Hello.')
  bot.reply(message, 'It\'s nice to talk to you directly.')
})

controller.hears('.*', ['mention'], function (bot, message) {
  bot.reply(message, 'You really do care about me. :heart:')
})

controller.hears('help', ['direct_message', 'direct_mention'], function (bot, message) {
  var help = 'I will respond to the following messages: \n' +
      '`bot hi` for a simple message.\n' +
      '`bot attachment` to see a Slack attachment message.\n' +
      '`@<your bot\'s name>` to demonstrate detecting a mention.\n' +
      '`bot help` to see this again.'
  bot.reply(message, help)
})

controller.hears(['attachment'], ['direct_message', 'direct_mention'], function (bot, message) {
  var text = 'Beep Beep Boop is a ridiculously simple hosting platform for your Slackbots.'
  var attachments = [{
    fallback: text,
    pretext: 'We bring bots to life. :sunglasses: :thumbsup:',
    title: 'Host, deploy and share your bot in seconds.',
    image_url: 'https://storage.googleapis.com/beepboophq/_assets/bot-1.22f6fb.png',
    title_link: 'https://beepboophq.com/',
    text: text,
    color: '#7CD197'
  }]

  bot.reply(message, {
    attachments: attachments
  }, function (err, resp) {
    console.log(err, resp)
  })
})

controller.hears('.*', ['direct_message', 'direct_mention'], function (bot, message) {
  bot.reply(message, 'Sorry <@' + message.user + '>, I don\'t understand. \n')
})*/
