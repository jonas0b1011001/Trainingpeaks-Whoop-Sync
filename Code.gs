/*##################################
Variables
*/

var tp_username = ""; //TrainingPeaks username
var tp_password = ""; //TrainingPeaks password
var whoop_mail = ""; //Whoop email
var whoop_password = ""; //Whoop password

/*##################################
Code

Run Main() to perform a single sync or scheduleSync() to automatically check for new workouts.
*/

function scheduleSync(){
  ScriptApp.newTrigger("Main").timeBased().everyMinutes(5).create();
}

function stopSync(){
  ScriptApp.getProjectTriggers().forEach(function(t){
    ScriptApp.deleteTrigger(t);
  });
}

function Main() {

  if (loadSetting("TP_access_token") == null){
    if (TpDoRegister()){
      Logger.log("Trainingpeaks API Registration successful");
    }
    else{
      Logger.log("Trainingpeaks API Registration failed, recheck login credentials!");
      return;
    };
  }
  if (loadSetting("Whoop_access_token") == null){
    if (WhoopDoRegister()){
      Logger.log("Whoop API Registration successful");
    }
    else{
      Logger.log("Whoop API Registration failed, recheck login credentials!");
      return;
    };
  }

  var workoutJSON = TpGetWorkouts(Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd"), Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd") ,false);

  if (workoutJSON == null || workoutJSON.getResponseCode() != '200'){
    Logger.log("Retrieving Workout Data from Trainingpeaks failed.");
    return;
  }
  
  var tpWorkouts = TpParseWorkouts(workoutJSON.getContentText())
  
  tpWorkouts.forEach(function(w){
    WhoopPostWorkout(w, false);
  });

}

function WhoopPostWorkout(data, retry){
  var url = `https://api-7.whoop.com/users/${loadSetting("Whoop_userid")}/workouts`

  var header = {
    'authorization' : `bearer ${loadSetting("Whoop_access_token")}`
  };

  var options = {
    'headers' : header,
    'method' : 'POST',
    'contentType' : 'application/json',
    'payload' : JSON.stringify(data),
    'muteHttpExceptions' : true
  };

  var response = UrlFetchApp.fetch(url, options);
  
  if (response.getResponseCode() == 401){//Not Authorized
    if (!retry && WhoopDoRefresh()){
      Logger.log("Whoop API Refresh successful");
      WhoopPostWorkout(data, true);
    }
    else{
      deleteSetting("Whoop_access_token");
      Logger.log("Whoop API Refresh failed.");
    }
    return;
  }

  response = JSON.parse(response);
  if (response.activityId) {
    Logger.log(`Workout ${response.activityId} successfully posted to Whoop!`);
  }
  else if(response.message.indexOf("Overlapping") > -1){
    Logger.log("Unable to post Activity to Whoop, there's already an overlapping workout");
  }
}

function WhoopDoRegister(){
  var url = "https://api-7.whoop.com/oauth/token";

  var data = {
     'username' : whoop_mail,
     'password': whoop_password,
     'grant_type': 'password',
     'issueRefresh': true};

  var options = {
    'method' : 'POST',
    'contentType' : 'application/json',
    'payload' : JSON.stringify(data)
  };

  var result = UrlFetchApp.fetch(url, options);
  
  if (result.getResponseCode() == 200) {
    var params = JSON.parse(result.getContentText());
    saveSetting("Whoop_access_token", params.access_token);
    saveSetting("Whoop_refresh_token", params.refresh_token);
    saveSetting("Whoop_userid", params.user.id.toString());
  }
  return (result.getResponseCode() == 200);
}

function WhoopDoRefresh() {
  
  var url = "https://api-7.whoop.com/oauth/token";
  
  var payload =
      {
        "grant_type" : "refresh_token",
        "refresh_token" : loadSetting("Whoop_refresh_token"),
      };
  
  var options =
      {
        "method"  : "POST",
        'contentType' : 'application/json',
        "payload" : JSON.stringify(payload),
        "muteHttpExceptions" : true
      };
  
  var result = UrlFetchApp.fetch(url, options);

  if (result.getResponseCode() == 200) {
    
    var params = JSON.parse(result.getContentText());
    
    saveSetting("Whoop_access_token", params.access_token);
    saveSetting("Whoop_refresh_token", params.refresh_token);
  }
  return (result.getResponseCode() == 200);
}

function TpParseWorkouts(data) {
  var result = [];
  var document = JSON.parse(data);
  for (var workout of document){
    if (workout.startTime == null || workout.totalTime == null){
      Logger.log(`Skipping incomplete Trainingpeaks Workout ${workout.workoutId}.`);
      continue;
    };
    var workoutType = workout.workoutTypeValueId.toString();
    switch (workoutType){
      case '1': //Swim
        workoutType = 33; //Swimming
        break;
      case '2': //Bike
        workoutType = 1; //Cycling
        break;
      case '3': //Run
        workoutType = 0; //Running
        break;
      case '4': //Brick
        workoutType = 49; //Duathlon
        break;
      case '5': //Crosstrain
        workoutType = 103; //Crossfit
        break;
      case '8': //Mountainbiking
        workoutType = 57; //Mountainbiking
        break;
      case '9': //Strength
        workoutType = 45; //Weightlifting
        break;
      case '10': //Custom
        workoutType =  getWhoopWorkoutTypeByTitle(workout.title.toString());
        if (workoutType == null){
          Logger.log(`Skipping unknown workout type ${workout.workoutId}.`);
          continue;
        }
        break;
      case '11': //XC-Ski
        workoutType = 47; //Crosscountry skiiing
        break;
      case '12': //Rowing
        workoutType = 0; //Crew
        break;
      case '13': //Walk
        workoutType = 63; //Walking
        break;
      case '100': //Other
        workoutType = 71; //Other
        break;
      default:
        Logger.log(`Skipping unknown workout type ${workout.workoutId}.`);
        continue;
    }
    
    var startDate = new Date(workout.startTime);
    var endDate = startDate.addHours(workout.totalTime);
    var payload = {
      "during": {
        "lower": Utilities.formatDate(startDate, "GMT", "yyyy-MM-dd'T'HH:mm:ss.000'Z'"),
        "upper": Utilities.formatDate(endDate, "GMT", "yyyy-MM-dd'T'HH:mm:ss.000'Z'")
        },
      "gpsEnabled": false,
      "sportId": workoutType,
      "timezoneOffset": "+0000"
    };
    if (loadSetting(workout.workoutId) != workout.lastModifiedDate){
      result.push(payload);
      saveSetting(workout.workoutId, workout.lastModifiedDate)
    }
    else{
      Logger.log(`Skipping unchanged Trainingpeaks Workout ${workout.workoutId}.`);
    }
  }
  return result;
}

function getWhoopWorkoutTypeByTitle(title){
  var sportsJSON = WhoopGetSports();
  if (sportsJSON != null){
    for (var sport of sportsJSON){
      if (title.contains(sport.name)){
        return sport.id;
      }
    }
  }
  return;
}

function WhoopGetSports(){
  
  var url = `https://api-7.whoop.com/activities-service/v1/sports`;
  
  var options =
      {
        "method" : "GET",
        "muteHttpExceptions" : true,
        "headers": {"Authorization": `Bearer ${loadSetting("Whoop_access_token")}`, "Accept-Language": "en"}
      };
    
  var result = UrlFetchApp.fetch(url, options);

  if (result.getResponseCode() != 200){//Not Authorized
    Logger.log("Unable to get Whoop sports list.");
    return;
  }

  return JSON.parse(result.getContentText());
}

function TpDoRegister() {
  
  var url = "https://oauth.trainingpeaks.com/oauth/token";
  
  var payload =
      {
        'grant_type' : 'password',
        'username' : tp_username,
        'password' : tp_password,
        'scope' : 'all',
        'client_id' : 'tpm',
        'client_secret' : 'k4/TKp41ybAn2H+uzYBCX9iEcmyL6JR9f/CGS13JbEM=',
      };
  
  var options =
      {
        'method'  : 'POST',
        'payload' : payload,
        "muteHttpExceptions" : true
      };
  var result = UrlFetchApp.fetch(url, options);

  if (result.getResponseCode() == 200) {
    
    var params = JSON.parse(result.getContentText());
    
    saveSetting("TP_access_token", params.access_token);
    saveSetting("TP_refresh_token", params.refresh_token);
    saveSetting("TP_token_type", params.token_type);
    saveSetting("TP_expires_in", params.expires_in);
    saveSetting("TP_scope", params.scope);

    TpGetUser();
  }
  
  return (result.getResponseCode() == 200);
}

function TpDoRefresh() {
  
  var url = "https://oauth.trainingpeaks.com/oauth/token";
  
  var payload =
      {
        "grant_type" : "refresh_token",
        "refresh_token" : loadSetting("TP_refresh_token"),
        "scope" : "all",
        "client_id" : "tpm",
        "client_secret" : "k4/TKp41ybAn2H+uzYBCX9iEcmyL6JR9f/CGS13JbEM=",
      };
  
  var options =
      {
        "method"  : "POST",
        "payload" : payload,
        "muteHttpExceptions" : true
      };
  
  var result = UrlFetchApp.fetch(url, options);

  if (result.getResponseCode() == 200) {
    
    var params = JSON.parse(result.getContentText());
    
    saveSetting("TP_access_token", params.access_token);
    saveSetting("TP_refresh_token", params.refresh_token);
    saveSetting("TP_token_type", params.token_type);
    saveSetting("TP_expires_in", params.expires_in);
    saveSetting("TP_scope", params.scope);
    TpGetUser();
  }
  return (result.getResponseCode() == 200);
}

function TpGetUser(){
  
  var url = "https://tpapi.trainingpeaks.com/users/v3/user";
  
  var options =
      {
        "method" : "GET",
        "muteHttpExceptions" : true,
        "headers": {"Authorization": 'Bearer ' +  loadSetting("TP_access_token")}
      };
    
  var result = UrlFetchApp.fetch(url, options);

  if (result.getResponseCode() == 200) {
    
    var params = JSON.parse(result.getContentText());
    
    saveSetting("TP_userid", params.user.userId.toString());
    saveSetting("TP_timezone", params.user.timeZone.toString());
  }  
}

function TpGetWorkouts(start, ende, retry){
  
  var url = `https://tpapi.trainingpeaks.com/fitness/v1/athletes/${loadSetting("TP_userid")}/workouts/${start}/${ende}`;
  
  var options =
      {
        "method" : "GET",
        "muteHttpExceptions" : true,
        "headers": {"Authorization": `Bearer ${loadSetting("TP_access_token")}`}
      };
    
  var result = UrlFetchApp.fetch(url, options);

  if (result.getResponseCode() == 401){//Not Authorized
    if (!retry && TpDoRefresh()){
      Logger.log("Trainingpeaks API Refresh successful");
      TpGetWorkouts(start, ende, true);
    }
    else{
      deleteSetting("TP_access_token");
      Logger.log("Trainingpeaks API Refresh failed.");
    }
    return;
  }

  return result;
}

function saveSetting(key, value){
  var userProperties = PropertiesService.getUserProperties();
  userProperties.setProperty(key, value);
}

function loadSetting(key){
  var userProperties = PropertiesService.getUserProperties();
  var value = userProperties.getProperty(key);
  return value;
}

function deleteSetting(key){
  var userProperties = PropertiesService.getUserProperties();
  userProperties.deleteProperty(key);
}

Date.prototype.addHours=function(h){return new Date(this.valueOf() + 1000*60*60*h);};
String.prototype.contains=function(c){return (this.indexOf(c) > -1);};