var Promise = require('bluebird');
var request = require('request-json');

module.exports = function AppDynamics(controllerRoot, username, password) {
    var client = request.createClient(controllerRoot + '/rest/');
    client.setBasicAuth(username, password);

    function get(url) {
        return new Promise(function (resolve, reject) {
            client.get(url, function(err, res, body) {
                if (res && res.statusCode !== 200) {
                    return reject(new Error({ code: res.statusCode, message: res.statusMessage }));
                }
                if (err) {
                    return reject(err);
                }           

                resolve(body);
            }); 
        });
    }

    function getApplications() {
        return get('applications?output=JSON');
    }

    function getBTsForApplication(applicationName) {
        return get('applications/' + applicationName + "/business-transactions?output=JSON");
    }

    function getMetricsForBT(applicationName, tierName, btName) {        
        var q = "Business Transaction Performance|Business Transactions|" + tierName + "|" + btName + "|*";
        return get('applications/' + applicationName + "/metric-data?output=JSON&time-range-type=BEFORE_NOW&duration-in-mins=15&metric-path=" + encodeURIComponent(q))
            .then(function (metrics) {
              var getMetricByName = function (match) {
                  return metrics.filter(function (m) {
                    return m.metricName.match(match);  
                  })[0].metricValues[0].value;
              };

              return {
                  responseTime: getMetricByName(/Average Response Time \(ms\)$/i),
                  throughput: getMetricByName(/Calls per minute$/i),
                  errorsPerMinute: getMetricByName(/Errors per Minute$/i),
              };  
            });
    }

    function getOpenIncidents(applicationNames) {
        if (!applicationNames) {
            return getApplications()
                .map(function (app) {
                    return app.name;
                })
                .then(getOpenIncidents);
        } else if (typeof applicationNames === 'string') {
            applicationNames = [ applicationNames ];
        }

        return Promise.map(applicationNames, function (applicationName) {
                return get('applications/' + applicationName + '/problems/healthrule-violations?output=JSON&time-range-type=BEFORE_NOW&duration-in-mins=1')
                    .then(function (body) {
                        console.log(body);
                        var openIncidents = body.filter(function (rule) {
                            return rule.incidentStatus === 'OPEN';
                        })
                        .sort(function (rule1, rule2) {
                            return (rule1.severity < rule2.severity) ? -1 : (rule1.severity > rule2.severity) ? 1 : 0;
                        })
                        .map(function (incident) {
                        return incident.severity + ': "' + incident.name + '" open on "' + incident.affectedEntityDefinition.name + '".';
                        });
                        if (openIncidents.length > 0) {
                            openIncidents[0] = "```" + openIncidents[0];
                            openIncidents[openIncidents.length - 1] += "```";                       
                            return ["*" + applicationName + "* has the following open violations: "].concat(openIncidents);
                        }                                

                        return [];
                    });
            }) 
            .reduce(function(previousValue, result) {
                return (previousValue || []).concat(result);
            })
            .then(function (results) {
                if (results.length === 0 && applicationNames.length > 1) {
                    return 'All applications are healthy.';
                } else if (results.length === 0) {
                    return "*" + applicationNames[0] + '* is healthy.';
                } else {
                    return results.join("\n");
                }  
            });
    }
    return {
        getApplications: getApplications,
        getOpenIncidents: getOpenIncidents,
        getBTsForApplication: getBTsForApplication,
        getMetricsForBT: getMetricsForBT
    };
}
