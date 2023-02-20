var isExtensionOn = false;
var iframe = null;

var settings = {};
var messageTimeout = 0;
var lastSentMessage = "";
var lastSentTimestamp = 0;
var lastMessageCounter = 0;
var sentimentAnalysisLoaded = false;

function generateStreamID(){
	var text = "";
	var possible = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
	for (var i = 0; i < 10; i++){
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	try{
		text = text.replaceAll('AD', 'vDAv');  // avoiding adblockers
		text = text.replaceAll('Ad', 'vdAv');
		text = text.replaceAll('ad', 'vdav');
		text = text.replaceAll('aD', 'vDav');
	} catch(e){}
	return text;
};


var properties = ["streamID", "password", "isExtensionOn", "settings"];
var channel = generateStreamID();
var password = false;

function loadSettings(item, resave=false){
	if (item && item.streamID){
		channel = item.streamID;
		if (resave){
			chrome.storage.sync.set({
				streamID: channel
			});
			chrome.runtime.lastError;
		}
	} else {
		chrome.storage.sync.set({
			streamID: channel
		});
		chrome.runtime.lastError;
	}
	if (item && ("password" in item)){
		password = item.password;
		
		if (resave){
			chrome.storage.sync.set({
				password: password
			});
			chrome.runtime.lastError;
		}
		
	} else {
		chrome.storage.sync.set({
			password: password
		});
		chrome.runtime.lastError;
	}
	if (item && item.settings){
		settings = item.settings;
		
		if (resave){
			chrome.storage.sync.set({
				settings: settings
			});
			chrome.runtime.lastError;
		}
	} else {
		chrome.storage.sync.set({
			settings: settings
		});
		chrome.runtime.lastError;
	}
	if (item && item.isExtensionOn){
		isExtensionOn = item.isExtensionOn;
		chrome.browserAction.setIcon({path: "/icons/on.png"});
		if (iframe==null){
			loadIframe(channel, password);
		}
		
		if (resave){
			chrome.storage.sync.set({
				isExtensionOn: isExtensionOn
			});
			chrome.runtime.lastError;
		}
	}  else {
		chrome.storage.sync.set({
			isExtensionOn: isExtensionOn
		});
		chrome.runtime.lastError;
	}
	toggleMidi();
	
	if (settings.sentiment){
		if (!sentimentAnalysisLoaded){
			loadSentimentAnalysis();
		}
	}
}


chrome.storage.sync.get(properties, function(item){
	loadSettings(item);
});

chrome.browserAction.setIcon({path: "/icons/off.png"});

function pushSettingChange(){
	chrome.tabs.query({}, function(tabs) {
		chrome.runtime.lastError;
		for (var i=0;i<tabs.length;i++){
			if (!tabs[i].url){continue;} 
			chrome.tabs.sendMessage(tabs[i].id, {settings:settings}, function(response=false) {
				chrome.runtime.lastError;
			});
		}
	});
}

function sleep(ms = 0) {
	return new Promise(r => setTimeout(r, ms)); // LOLz!
}
async function loadmidi(){
	const opts = {
		types: [{
		  description: 'JSON file',
		  accept: {'text/plain': ['.json', '.txt', '.data', '.midi']},
		}],
	  };
	var midiFileHandler = await window.showOpenFilePicker();
 
	try {
		var midiConfigFile = await midiFileHandler[0].getFile();
		midiConfigFile = await midiConfigFile.text();
		settings.midiConfig = JSON.parse(midiConfigFile);
	} catch(e){
		settings.midiConfig = false;
		console.log(e);
		alert("File does not contain a valid JSON structure");
	}
	chrome.storage.sync.set({
		settings: settings
	});
	chrome.runtime.lastError;
}

var newFileHandle = false;
async function overwriteFile(data=false) {
  if (data=="setup"){
	  newFileHandle = await window.showSaveFilePicker();
  } else if (newFileHandle && data){
	  const writableStream = await newFileHandle.createWritable();
	  await writableStream.write(data);
	  await writableStream.close();
  }
}


/* var newFileHandleExcel = false;
async function overwriteFileExcel(data=false) {
  if (data=="setup"){
	  newFileHandleExcel = await window.showSaveFilePicker();
  } else if (newFileHandleExcel && data){
	  const size = (await newFileHandleExcel.getFile()).size;
	  const writableStream = await newFileHandleExcel.createWritable();
	  await writableStream.write( type: "write",
		  data: data,
		  position: size // Set the position to the current file size.
	  });
	  await writableStream.close();
  }
} */

var workbook = false;
var worksheet = false;
var table = [];

var newFileHandleExcel = false;
async function overwriteFileExcel(data=false) {
	if (data=="setup"){
		
		 const opts = {
			types: [{
			  description: 'Excel file',
			  accept: {'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']},
			}],
		  };
  
		newFileHandleExcel = await window.showSaveFilePicker(opts);
		workbook = XLSX.utils.book_new();

		data = [];

		worksheet = XLSX.utils.aoa_to_sheet(data);
		workbook.SheetNames.push("SocialStream-"+channel);
		workbook.Sheets["SocialStream-"+channel] = worksheet;

		var xlsbin = XLSX.write(workbook, {
			bookType: "xlsx",
			type: "binary"
		});
		
		var buffer = new ArrayBuffer(xlsbin.length),
		array = new Uint8Array(buffer);
		for (var i=0; i<xlsbin.length; i++) {
			array[i] = xlsbin.charCodeAt(i) & 0XFF;
		}
		var xlsblob = new Blob([buffer], {type:"application/octet-stream"});
		delete array; delete buffer; delete xlsbin;

		const writableStream = await newFileHandleExcel.createWritable();
		await writableStream.write(xlsblob);
		await writableStream.close();
		
	} else if (newFileHandleExcel && data){
		
		for (var key in data){
			if (!table.includes(key)){
				table.push(key);
			}
		}
		var column = [];
		table.forEach(key=>{
			if (key in data){
				column.push(data[key]);
			} else {
				column.push("");
			}
		});

		
		XLSX.utils.sheet_add_aoa(worksheet, [table], {origin: 0}); // replace header
		XLSX.utils.sheet_add_aoa(worksheet, [column], {origin: -1}); // append new line
		
		var xlsbin = XLSX.write(workbook, {
			bookType: "xlsx",
			type: "binary"
		})

		var buffer = new ArrayBuffer(xlsbin.length),
		array = new Uint8Array(buffer);
		for (var i=0; i<xlsbin.length; i++) {
			array[i] = xlsbin.charCodeAt(i) & 0XFF;
		}
		var xlsblob = new Blob([buffer], {type:"application/octet-stream"});
		delete array; delete buffer; delete xlsbin;

		const writableStream = await newFileHandleExcel.createWritable();
		await writableStream.write(xlsblob);
		await writableStream.close();
	}
}

async function exportSettings(){
	chrome.storage.sync.get(properties, async function(item){
		 const opts = {
			types: [{
			  description: 'Data file',
			  accept: {'application/data': ['.data']},
			}],
		  };
  
		fileExportHandler = await window.showSaveFilePicker(opts);
		
		const writableStream = await fileExportHandler.createWritable();
		await writableStream.write(JSON.stringify(item));
		await writableStream.close();
		
	})
}

async function importSettings(item){
	const opts = {
		types: [{
		  description: 'JSON file',
		  accept: {'text/plain': ['.data']},
		}],
	  };
	var importFileHandler = await window.showOpenFilePicker();
	try {
		var importFile = await importFileHandler[0].getFile();
		importFile = await importFile.text();
		loadSettings(JSON.parse(importFile));
	} catch(e){
		alert("File does not contain a valid JSON structure");
	}
}


var Url2ChannelImg = {};
var vid2ChannelImg = {};

function getYoutubeAvatarImage(url, skip=false){
	try {
		if (url in Url2ChannelImg){return Url2ChannelImg[url];}
		Url2ChannelImg[url] = ""; // prevent spamming of the API
		//Url2ChannelImg = Url2ChannelImg.slice(-100); // caching limits
		var videoid = YouTubeGetID(url);
		if (videoid){
			if (videoid in vid2ChannelImg){return vid2ChannelImg[videoid];}
			vid2ChannelImg[videoid] = "";
			//vid2ChannelImg = vid2ChannelImg.slice(-100); // caching limits
			const xhttp = new XMLHttpRequest();
			xhttp.onload = function() {
				if (this.responseText.startsWith("https://")){
					Url2ChannelImg[url] = this.responseText;
					vid2ChannelImg[videoid] = this.responseText;
				}
			}
			xhttp.open("GET", "https://api.socialstream.ninja/youtube/channel?video="+encodeURIComponent(videoid), true);
			xhttp.send();
			if (skip){return;}
			sleep(200);
			if (vid2ChannelImg[videoid]){return vid2ChannelImg[videoid];} // a hacky/lazy way to wait for the response to complete
			sleep(200);
			if (vid2ChannelImg[videoid]){return vid2ChannelImg[videoid];}
			sleep(200);
			if (vid2ChannelImg[videoid]){return vid2ChannelImg[videoid];}
			sleep(200);
			if (vid2ChannelImg[videoid]){return vid2ChannelImg[videoid];}
			sleep(200);
			if (vid2ChannelImg[videoid]){return vid2ChannelImg[videoid];}
			sleep(200);
			if (vid2ChannelImg[videoid]){return vid2ChannelImg[videoid];}
			sleep(200);
			if (vid2ChannelImg[videoid]){return vid2ChannelImg[videoid];}
			sleep(200);
			if (vid2ChannelImg[videoid]){return vid2ChannelImg[videoid];}
			sleep(200);
			if (vid2ChannelImg[videoid]){return vid2ChannelImg[videoid];}
			sleep(200);
			if (vid2ChannelImg[videoid]){return vid2ChannelImg[videoid];}
		}
	} catch(e){}
	return false;
}
function YouTubeGetID(url){
  var ID = '';
  url = url.replace(/(>|<)/gi,'').split(/(vi\/|v=|\/v\/|youtu\.be\/|\/embed\/)/);
  if(url[2] !== undefined) {
	ID = url[2].split(/[^0-9a-z_\-]/i);
	ID = ID[0];
  } else {
	ID = url;
  }
  return ID;
}

var colours = 167772;
function rainbow(step) {
	var r, g, b;
	var h = 1 - (step / colours);
	var i = ~~(h * 6);
	var f = h * 6 - i;
	var q = 1 - f;
	switch(i % 6){
		case 0: r = 1, g = f, b = 0; break;
		case 1: r = q, g = 1, b = 0; break;
		case 2: r = 0, g = 1, b = f; break;
		case 3: r = 0, g = q, b = 1; break;
		case 4: r = f, g = 0, b = 1; break;
		case 5: r = 1, g = 0, b = q; break;
	}
	var c = "#" + ("00" + (~ ~(r * 200+35)).toString(16)).slice(-2) + ("00" + (~ ~(g * 200 +35)).toString(16)).slice(-2) + ("00" + (~ ~(b * 200 +35)).toString(16)).slice(-2);
	return (c);
}

function getColorFromName(str) {
  var out = 0, len = str.length;
  if (len>6){
	  len = 6;
  }
  for (pos = 0; pos < len; pos++) {
    out += (str.charCodeAt(pos) - 64) * Math.pow(26, len - pos - 1);
  }
  out = out%colours; // get modulus
  out = rainbow(out)
  return out;
}
		
chrome.runtime.onMessage.addListener(
    async function (request, sender, sendResponse) {
		try{
			if (request.cmd && request.cmd === "setOnOffState") { // toggle the IFRAME (stream to the remote dock) on or off
				isExtensionOn = request.data.value;
				if (isExtensionOn){
					if (iframe==null){
						loadIframe(channel, password);
					}
				} else {
					if (iframe.src){
						iframe.src = null;
					}
					iframe.remove();
					iframe = null;
				}
				chrome.storage.sync.set({
					isExtensionOn: isExtensionOn
				});
				chrome.runtime.lastError;
				toggleMidi();
				sendResponse({"state":isExtensionOn,"streamID":channel, "password":password, "settings":settings});
			} else if (request.cmd && request.cmd === "getOnOffState") {
				sendResponse({"state":isExtensionOn,"streamID":channel, "password":password, "settings":settings});
			} else if (request.cmd && request.cmd === "saveSetting") {
				if (typeof settings[request.setting] == "object"){
					if (!request.value){
						delete settings[request.setting];
					} else {
						settings[request.setting][request.type] = request.value;
						settings[request.setting].value = request.value;
					}
				} else if ("type" in request){
					if (!request.value){
						delete settings[request.setting];
					} else {
						settings[request.setting] = {};
						settings[request.setting][request.type] = request.value;
						settings[request.setting].value = request.value;
					}
				} else {
					settings[request.setting] = request.value;
				}
				
				chrome.storage.sync.set({
					settings: settings
				});
				chrome.runtime.lastError;
				sendResponse({"state":isExtensionOn});	
				
				
				if (request.setting == "midi"){
					toggleMidi();
				}
				
				
				
				if (request.setting == "socketserver"){
					if (request.value){
						allowSocketServer = true;
						if (!socketserver){
							socketserver = new WebSocket(serverURL); 
							setupSocket();
						}
					} else {
						allowSocketServer = false;
						if (socketserver){
							socketserver.close();
						}
					}
				}
				
				if (request.setting == "textonlymode"){
					pushSettingChange();
				}
				
				if (request.setting == "myname"){
					pushSettingChange();
				}
				
				if (request.setting == "nosubcolor"){
					pushSettingChange();
				}
				
				if (request.setting == "captureevents"){
					pushSettingChange();
				} 
				
				if (request.setting == "sentiment"){
					if (request.value){
						if (!sentimentAnalysisLoaded){
							loadSentimentAnalysis();
						}
					}
				}
			} else if ("inject" in request){
				if (request.inject == "mobcrush"){
					chrome.webNavigation.getAllFrames({tabId: sender.tab.id}, (frames) => {
						frames.forEach(f=>{
							if (f.frameId && (f.frameType==="sub_frame") && f.url.includes("https://www.mobcrush.com/")){
								chrome.tabs.executeScript(sender.tab.id, {
								  frameId: f.frameId,
								  file: 'mobcrush.js'
								});
							}
						});
					});
				}
			} else if ("message" in request) { // forwards messages from Youtube/Twitch/Facebook to the remote dock via the VDO.Ninja API
				request.message.tid = sender.tab.id; // including the source (tab id) of the social media site the data was pulled from 
				sendResponse({"state":isExtensionOn}); // respond to Youtube/Twitch/Facebook with the current state of the plugin; just as possible confirmation.
				
				if (isExtensionOn && request.message.type){
					if (!checkIfAllowed(request.message.type)){ // toggled is not enabled for this site
						return;
					}
					
					if (request.message.type == "youtube"){
						if (sender.tab.url){
							var brandURL = getYoutubeAvatarImage(sender.tab.url); // query my API to see if I can resolve the Channel avatar from the video ID
							if (brandURL){
								request.message.sourceImg = brandURL;
							}
						}
					}
					
					try{
						request.message = await applyBotActions(request.message); // perform any immediate actions
						if (request.message===null){return;}
					} catch(e){console.log(e);}
					
					
					if (settings.filtercommands && request.message.chatmessage && request.message.chatmessage.startsWith("!")){
						return;
					}
					
					if (settings.firstsourceonly){
						if (!verifyOriginal(request.message)){
							return;
						}
					}
					
					sendToDestinations(request.message); // send the data to the dock
				}
			} else if ("getSettings" in request) { // forwards messages from Youtube/Twitch/Facebook to the remote dock via the VDO.Ninja API
				sendResponse({"settings":settings}); // respond to Youtube/Twitch/Facebook with the current state of the plugin; just as possible confirmation.
			} else if ("keepAlive" in request) { // forwards messages from Youtube/Twitch/Facebook to the remote dock via the VDO.Ninja API
				var action = {};
				action.tid = sender.tab.id; // including the source (tab id) of the social media site the data was pulled from 
				action.response = ""; // empty response, as we just want to keep alive
				processResponse(action);
				sendResponse({"state":isExtensionOn});
			} else if (request.cmd && request.cmd === "tellajoke") {
				tellAJoke();
				sendResponse({"state":isExtensionOn});
			} else if (request.cmd && request.cmd === "enableYouTube") {
				enableYouTube();
				sendResponse({"state":isExtensionOn});	
			} else if (request.cmd && request.cmd === "openchat") {
				openchat(request.value);
				sendResponse({"state":isExtensionOn});	
			} else if (request.cmd && request.cmd === "singlesave") {
				sendResponse({"state":isExtensionOn});	
				overwriteFile("setup");
			} else if (request.cmd && request.cmd === "excelsave") {
				sendResponse({"state":isExtensionOn});	
				overwriteFileExcel("setup");
			} else if (request.cmd && request.cmd === "loadmidi") {
				await loadmidi(sendResponse);
				sendResponse({"settings":settings});
			} else if (request.cmd && request.cmd === "export") {
				sendResponse({"state":isExtensionOn});	
				await exportSettings();
			} else if (request.cmd && request.cmd === "import") {
				sendResponse({"state":isExtensionOn});	
				await importSettings();
			} else if (request.cmd && request.cmd === "excelsaveStop") {
				sendResponse({"state":isExtensionOn});	
				newFileHandleExcel = false;
			} else if (request.cmd && request.cmd === "fakemsg") {
				sendResponse({"state":isExtensionOn});	
				var data = {};
				data.chatname = "John Doe";
				data.nameColor = "";
				data.chatbadges = "";
				data.backgroundColor = "";
				data.textColor = "";
				data.chatmessage = "Looking good! 😘😘😊  This is a test message. 🎶🎵🎵🔨 ";
				data.chatimg = "";
				data.type = "youtube";
				if (Math.random()>0.90){
					data.hasDonation = "100 gold";
					data.hasMembership = "";
					data.chatname = "Bob";
					data.chatbadges = [];
					var html = {};
					html.html = '<svg viewBox="0 0 16 16" preserveAspectRatio="xMidYMid meet" focusable="false" class="style-scope yt-icon" style="pointer-events: none; display: block; width: 100%; height: 100%; fill: rgb(95, 132, 241);"><g class="style-scope yt-icon"><path d="M9.64589146,7.05569719 C9.83346524,6.562372 9.93617022,6.02722257 9.93617022,5.46808511 C9.93617022,3.00042984 7.93574038,1 5.46808511,1 C4.90894765,1 4.37379823,1.10270499 3.88047304,1.29027875 L6.95744681,4.36725249 L4.36725255,6.95744681 L1.29027875,3.88047305 C1.10270498,4.37379824 1,4.90894766 1,5.46808511 C1,7.93574038 3.00042984,9.93617022 5.46808511,9.93617022 C6.02722256,9.93617022 6.56237198,9.83346524 7.05569716,9.64589147 L12.4098057,15 L15,12.4098057 L9.64589146,7.05569719 Z" class="style-scope yt-icon"></path></g></svg>';
					html.type = "svg";
					data.chatbadges.push(html);
					
				} else if (Math.random()>0.83){
					data.hasDonation = "3 hearts";
					data.hasMembership = "";
					data.chatmessage = "";
					data.chatname = "Lucy";
				} else if (Math.random()>0.7){
					data.hasDonation = "";
					data.hasMembership = "";
					data.chatname = "vdoninja";
					data.type = "twitch";
					var score = parseInt(Math.random()* 378);
					data.chatmessage  =  jokes[score]["setup"] + "..  " + jokes[score]["punchline"]  + " 😊";
				} else if (Math.random()>0.6){
					data.hasDonation = "100 gold";
					data.hasMembership =  '';
					data.chatname = "Steve";
					var score = parseInt(Math.random()* 378);
					data.chatmessage  =  '<img src="https://github.com/steveseguin/social_stream/raw/main/icons/icon-128.png">'; 
				} else if (Math.random()>0.5){
					data.hasDonation = "";
					data.nameColor = "#107516";
					data.chatimg = "sampleavatar.png";
					data.hasMembership =  '<div class="donation membership">SPONSORSHIP</div>';
					data.chatname = "Steve";
					data.type = "facebook";
					data.chatmessage  = "The only way to do great work is to love what you do. If you haven't found it yet, keep looking. Don't settle. As with all matters of the heart, you'll know when you find it.";
				} else if (Math.random()>0.2){
					data.hasDonation = "";
					data.hasMembership = "";
				} else {
					data.hasDonation = "";
					data.hasMembership = '<div class="donation membership">SPONSORSHIP</div>';
				}
				
				data = await applyBotActions(data); // perform any immediate (custom) actions, including modifying the message before sending it out
				sendToDestinations(data);
				
			} else if (request.cmd && request.cmd === "sidUpdated") {
				if (request.streamID){
					channel = request.streamID;
				}
				if ("password" in request){
					password = request.password;
				}
				if (iframe){
					if (iframe.src){
						iframe.src = null;
					}
					
					iframe.remove();
					iframe = null;
				}
				if (isExtensionOn){
					loadIframe(channel, password);
				}
				
				sendResponse({"state":isExtensionOn});	
			} else {
				sendResponse({"state":isExtensionOn});
			}
		} catch(e){}
    }
);

// The below "levenshtein" function is based on the follow work:
// https://github.com/gustf/js-levenshtein
// MIT License - Requires preservation of copyright and license notice
// Copyright (c) 2017 Gustaf Andersson
function levenshtein(a,b){
	if (a === b) {
	  return 0;
	}
	if (a.length > b.length) {
	  var tmp = a;
	  a = b;
	  b = tmp;
	}
	var la = a.length;
	var lb = b.length;
	while (la > 0 && (a.charCodeAt(la - 1) === b.charCodeAt(lb - 1))) {
	  la--;
	  lb--;
	}
	var offset = 0;
	while (offset < la && (a.charCodeAt(offset) === b.charCodeAt(offset))) {
	  offset++;
	}
	la -= offset;
	lb -= offset;
	if (la === 0 || lb < 3) {
	  return lb;
	}
	var x = 0;
	var y;
	var d0;
	var d1;
	var d2;
	var d3;
	var dd;
	var dy;
	var ay;
	var bx0;
	var bx1;
	var bx2;
	var bx3;
	var vector = [];
	for (y = 0; y < la; y++) {
	  vector.push(y + 1);
	  vector.push(a.charCodeAt(offset + y));
	}
	var len = vector.length - 1;
	for (; x < lb - 3;) {
	  bx0 = b.charCodeAt(offset + (d0 = x));
	  bx1 = b.charCodeAt(offset + (d1 = x + 1));
	  bx2 = b.charCodeAt(offset + (d2 = x + 2));
	  bx3 = b.charCodeAt(offset + (d3 = x + 3));
	  dd = (x += 4);
	  for (y = 0; y < len; y += 2) {
		dy = vector[y];
		ay = vector[y + 1];
		d0 = _min(dy, d0, d1, bx0, ay);
		d1 = _min(d0, d1, d2, bx1, ay);
		d2 = _min(d1, d2, d3, bx2, ay);
		dd = _min(d2, d3, dd, bx3, ay);
		vector[y] = dd;
		d3 = d2;
		d2 = d1;
		d1 = d0;
		d0 = dy;
	  }
	}
	for (; x < lb;) {
	  bx0 = b.charCodeAt(offset + (d0 = x));
	  dd = ++x;
	  for (y = 0; y < len; y += 2) {
		dy = vector[y];
		vector[y] = dd = _min(dy, d0, dd, bx0, vector[y + 1]);
		d0 = dy;
	  }
	}
	return dd;
}
function _min(d0, d1, d2, bx, ay){
	return d0 < d1 || d2 < d1
	? d0 > d2
		? d2 + 1
		: d0 + 1
	: bx === ay
		? d1
		: d1 + 1;
}
//// End of levenshtein code
////////////////////////////


function verifyOriginal(msg){
	try {
		if (Date.now() - lastSentTimestamp > 5000){ // 2 seconds has passed; assume good.
			return true;
		}
		var cleanText = msg.chatmessage.replace(/<\/?[^>]+(>|$)/g, ""); // clean up; remove HTML tags, etc.
		cleanText = cleanText.replace(/\s\s+/g, ' ');
		var score = levenshtein(cleanText, lastSentMessage);
		if (score<7){
			if (lastMessageCounter){return false;}
			lastMessageCounter=1;
		} else {
			return false;
		}
	} catch(e){}
	return true;
}

function ajax(object2send, url, ajaxType="PUT"){
	var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
	if (this.readyState == 4 && this.status == 200) {
		// success
	} else {
		console.error("there was an error sending to the API");
	}
	};
	xhttp.open(ajaxType, url, true); // async = true
	xhttp.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
	xhttp.send(JSON.stringify(object2send));
}

var messageCounter = 0;
function sendToDestinations(message){
	
	if (typeof message == "object"){
		messageCounter+=1;
		message.id = messageCounter;
	}
	if (settings.randomcolor && message && ("nameColor" in message) && !message.nameColor && message.chatname){
		message.nameColor = getColorFromName(message.chatname);
	}
	
	sendDataP2P(message);
	sendToDisk(message);
	sendToH2R(message);
	sendToPost(message);
	return true;
}

function sendToH2R(data){
	
	if (settings.h2r && settings.h2rserver && settings.h2rserver.textsetting){
		try {
			var postServer = "http://127.0.0.1:4001/data/";

			if (settings.h2rserver.textsetting.startsWith("http")){ // full URL provided
				postServer = settings.h2rserver.textsetting;
			} else if (settings.h2rserver.textsetting.startsWith("127.0.0.1")){ // missing the HTTP, so assume what they mean
				postServer = "http://"+settings.h2rserver.textsetting;
			} else {
				postServer += settings.h2rserver.textsetting; // Just going to assume they gave the token
			}
				
			var msg = {};
			
			if ("id" in data){
				msg.id = data.id;
			}
			
			if (data.timestamp){
				msg.timestamp = data.timestamp;
			}
			
			msg.snippet = {};
			msg.snippet.displayMessage = data.chatmessage || "";
			
			msg.authorDetails = {};
			msg.authorDetails.displayName = data.chatname || "";
			
			
			
			if (data.type && (data.type == "twitch") && data.chatname){
				msg.authorDetails.profileImageUrl = "https://api.socialstream.ninja/twitch/large?username="+encodeURIComponent(data.chatname); // 150x150
				
			} else if (data.type && (data.type == "youtube") && data.chatimg){
				let chatimg = data.chatimg.replace("=s32-", "=s256-");  
				msg.authorDetails.profileImageUrl = chatimg.replace("=s64-", "=s256-");
				
			} else {
				msg.authorDetails.profileImageUrl = data.chatimg || "https://socialstream.ninja/unknown.png";
			}
			
			
			if (data.type){
				msg.platform = {};
				msg.platform.name = data.type || "";
				msg.platform.logoUrl = "https://socialstream.ninja/"+data.type+".png";
			}
			
			var h2r = {};
			h2r.messages = [];
			h2r.messages.push(msg);
			ajax(h2r, postServer, "POST");
		} catch(e){
			console.warn(e);
		}
	}
}

function sendToPost(data){
	
	if (settings.post && settings.postserver && settings.postserver.textsetting){
		try {
			var postServer = "http://127.0.0.1:80";

			if (settings.postserver.textsetting.startsWith("http")){ // full URL provided
				postServer = settings.postserver.textsetting;
			} else if (settings.postserver.textsetting.startsWith("127.0.0.1")){ // missing the HTTP, so assume what they mean
				postServer = "http://"+settings.postserver.textsetting;
			} else {
				postServer += settings.postserver.textsetting; // Just going to assume they gave the token
			}
			
			if (data.type && !data.chatimg && (data.type == "twitch") && data.chatname){
				data.chatimg = "https://api.socialstream.ninja/twitch/large?username="+encodeURIComponent(data.chatname); // 150x150
				
			} else if (data.type && (data.type == "youtube") && data.chatimg){
				let chatimg = data.chatimg.replace("=s32-", "=s256-");  
				data.chatimg = chatimg.replace("=s64-", "=s256-");
				
			} else {
				data.chatimg = data.chatimg || "https://socialstream.ninja/unknown.png";
			}
			
			
			if (data.type){
				data.logo = "https://socialstream.ninja/"+data.type+".png";
			}
			
			ajax(data, postServer, "POST");
		} catch(e){
			console.warn(e);
		}
	}
}

var allowSocketServer = false;
var socketserver = false;
var serverURL = "wss://api.overlay.ninja";
var conCon = 0;

function setupSocket(){
	
	if (!socketserver && allowSocketServer){
		socketserver = new WebSocket(serverURL);
	}
	
	socketserver.onclose = function (){
		if (allowSocketServer){
			setTimeout(function(){
				if (allowSocketServer){
					conCon+=1;
					socketserver = new WebSocket(serverURL); 
					setupSocket();
				} else {
					socketserver = false;
				}
			},100*conCon);
		} else {
			socketserver = false;
		}
	};
	socketserver.onopen = function (){
		conCon = 0;
		socketserver.send(JSON.stringify({"join":channel,"out":2,"in":1}));
	};
	socketserver.addEventListener('message', async function (event) {
		if (event.data){
			
			var data = JSON.parse(event.data);
			var resp = false;
			if (data.action && (data.action === "sendChat") && data.value){
				var msg = {};
				msg.response = data.value;
				resp = processResponse(msg);
			} else if (data.action && (data.action === "sendEncodedChat") && data.value){
				var msg = {};
				msg.response = decodeURIComponent(data.value);
				resp = processResponse(msg);
			} else if (!data.action && data.extContent){ // Not flattened
				try {
					var msg = await applyBotActions(data.extContent); // perform any immediate (custom) actions, including modifying the message before sending it out
					if (msg){
						resp = sendToDestinations(msg);
					}
				} catch(e){
					console.error(e);
				}
			} else if (data.action && (data.action === "extContent") && data.value){ // flattened
				try {
					let msg = JSON.parse(data.value);
					msg = await applyBotActions(msg); // perform any immediate (custom) actions, including modifying the message before sending it out
					if (msg){
						resp = sendToDestinations(msg);
					}
				} catch(e){
					console.error(e);
				}
			} 
			
			var ret = {};
			if (typeof resp == "object"){
				resp = true;
			}
			if (data.get){
				var ret = {};
				ret.callback = {};
				ret.callback.get = data.get
				ret.callback.result = true;
				socketserver.send(JSON.stringify(ret));
			}
		}
	});
}

function enableYouTube(){ // function to send data to the DOCk via the VDO.Ninja API
	try {
		iframe.contentWindow.postMessage({"enableYouTube":settings.youtubeapikey.textsetting}, '*'); // send only to 'viewers' of this stream
	} catch(e){
		console.error(e);
	}
}

function openchat(target=null){
	if ((target=="youtube" || !target)  && settings.youtube_username){
		if (!settings.youtube_username.textsetting.startsWith("@")){
			settings.youtube_username.textsetting = "@"+settings.youtube_username.textsetting;
		}
		fetch("https://www.youtube.com/c/"+settings.youtube_username.textsetting+"/live").then((response) => response.text()).then((data) => {
			try{
				var videoID = data.split('{"videoId":"')[1].split('"')[0];
				console.log(videoID);
				window.open("https://www.youtube.com/live_chat?is_popout=1&v="+videoID, '_blank');
			} catch(e){
				// not live?
			}
		});
	}
	
	if ((target=="twitch" || !target)  && settings.twitch_username){
		window.open("https://www.twitch.tv/popout/"+settings.twitch_username.textsetting+"/chat?popout=", '_blank');
	}
}

function sendDataP2P(data){ // function to send data to the DOCk via the VDO.Ninja API
	var msg = {};
	msg.overlayNinja = data;
	try {
		iframe.contentWindow.postMessage({"sendData":msg, "type": "pcs"}, '*'); // send only to 'viewers' of this stream
	} catch(e){}
}

function sendToDisk(data){
	if (newFileHandle){
		try {
			if (typeof data == "object"){
				data.timestamp = new Date().getTime();
				
				if (data.type && data.chatimg && (data.type == "youtube")){
					data.chatimg = data.chatimg.replace("=s32-", "=s512-");  // high, but meh.
					data.chatimg = data.chatimg.replace("=s64-", "=s512-");
				}
				
				if (data.type && (data.type == "twitch") && data.chatname){
					data.chatimg = "https://api.socialstream.ninja/twitch/large?username="+encodeURIComponent(data.chatname); // 150x150
				}
				
				overwriteFile(JSON.stringify(data));
			}
		} catch(e){}
	}
	if (newFileHandleExcel){
		try {
			if (typeof data == "object"){
				data.timestamp = new Date().getTime();
				
				if (data.type && data.chatimg && (data.type == "youtube")){
					data.chatimg = data.chatimg.replace("=s32-", "=s256-");  
					data.chatimg = data.chatimg.replace("=s64-", "=s256-");
				}
				
				if (data.type && (data.type == "twitch") && data.chatname){
					data.chatimg = "https://api.socialstream.ninja/twitch/large?username="+encodeURIComponent(data.chatname); // 150x150
				}
				overwriteFileExcel(data);
			}
		} catch(e){}
	}
}


	
function loadIframe(channel, pass=false){  // this is pretty important if you want to avoid camera permission popup problems.  You can also call it automatically via: <body onload=>loadIframe();"> , but don't call it before the page loads.
	iframe = document.createElement("iframe");
	if (!pass){
		pass = "false";
	}
	iframe.src = "https://vdo.socialstream.ninja/alpha/?ln&salt=vdo.ninja&password="+pass+"&room="+channel+"&push="+channel+"&vd=0&ad=0&autostart&cleanoutput&view&label=SocialStream"; // don't listen to any inbound events
	document.body.appendChild(iframe);
}

var eventMethod = window.addEventListener ? "addEventListener" : "attachEvent"; // lets us listen to the VDO.Ninja IFRAME API; ie: lets us talk to the dock
var eventer = window[eventMethod];
var messageEvent = eventMethod === "attachEvent" ? "onmessage" : "message";
var debuggerEnabled = {};
var commandCounter = 0;

function onDetach(debuggeeId) {  // for faking user input
	debuggerEnabled[debuggeeId.tabId] = false;
}
try{
	chrome.debugger.onDetach.addListener(onDetach);
} catch(e){
	console.log("'chrome.debugger' not supported by this browser");
}
function onAttach(debuggeeId, callback, message, a=null,b=null,c=null) { // for faking user input
  if (chrome.runtime.lastError) {
    console.log(chrome.runtime.lastError.message);
    return;
  }
  debuggerEnabled[debuggeeId.tabId] = true;
  if (c!==null){
	  callback(debuggeeId.tabId, message, a,b,c);
  } else if (b!==null){
	  callback(debuggeeId.tabId, message, a,b);
  } else if (a!==null){
	  callback(debuggeeId.tabId, message, a);
  } else {
	  callback(debuggeeId.tabId, message);
  }
}

eventer(messageEvent, async function (e) {
	if (e.data && (typeof e.data == "object")){
		if (("dataReceived" in e.data) && ("overlayNinja" in e.data.dataReceived)){
			if ("response" in e.data.dataReceived.overlayNinja){ // we receieved a response from the dock
				processResponse(e.data.dataReceived.overlayNinja);
			}
		} else if ("action" in e.data){
			if (e.data.action === "YoutubeChat"){
				if (e.data.value && data.value.snippet && data.value.authorDetails){
					var data = {};
					data.chatname = e.data.value.authorDetails.displayName || "";
					data.chatimg = e.data.value.authorDetails.profileImageUrl || "";

					data.nameColor = "";
					data.chatbadges = "";
					data.backgroundColor = "";
					data.textColor = "";
					
					data.chatmessage = data.value.snippet.displayMessage || "";
					
					data.hasDonation = "";
					data.hasMembership = "";
					
					data.type = "youtube";
					
					console.log(data);
					data = await applyBotActions(data); // perform any immediate (custom) actions, including modifying the message before sending it out
					sendToDestinations(data);
				} else {
					console.log(e.data);
				}
			}
		}
	}
});

function checkIfAllowed(sitename){
	if (!settings.discord){
		try {
			if (sitename == "discord"){
				return false;
			}
			if (sitename.startsWith("https://discord.com/")){
				return false;
			}
		} catch(e){}
	}
	if (!settings.slack){
		try {
			if (sitename == "slack"){
				return false;
			}
			if (sitename.startsWith("https://app.slack.com/")){
				return false;
			}
		} catch(e){}
	}
	if (!settings.chime){
		try {
			if (sitename == "chime"){
				return false;
			}
			if (sitename.startsWith("https://app.chime.aws/")){
				return false;
			}
		} catch(e){}
	}
	if (!settings.meet){
		try {
			if (sitename == "meet"){
				return false;
			}
			if (sitename.startsWith("https://meet.google.com/")){
				return false;
			}
		} catch(e){}
	}
	if (!settings.telegram){
		try {
			if (sitename == "telegram"){
				return false;
			}
			if (sitename.includes(".telegram.org/")){
				return false;
			}
		} catch(e){}
	}
	if (!settings.whatsapp){
		try {
			if (sitename == "whatsapp"){
				return false;
			}
			if (sitename.startsWith("https://web.whatsapp.com/")){
				return false;
			}
		} catch(e){}
	}
	
	if (!settings.instagram){
		try {
			if (sitename == "instagram"){ // "instagram live" is allowed still, just not comments
				return false;
			}
			if (sitename.startsWith("https://www.instagram.com/")){
				return false;
			}
		} catch(e){}
	}
	return true;
}

function processResponse(data){
	
	if (!chrome.debugger){return false;}
	if (!isExtensionOn){return false;} // extension not active, so don't let responder happen. Probably safer this way.
	 
	chrome.tabs.query({}, function(tabs) {
		if (chrome.runtime.lastError) {
			console.warn(chrome.runtime.lastError.message);
		}
		var published = {};
		for (var i=0;i<tabs.length;i++){
			try {
				if (("tid" in data) && (data.tid!==false)){ // if an action-response, we want to only respond to the tab that originated it
					if ( data.tid !== tabs[i].id){continue;} 
				}
				if (!tabs[i].url){continue;} 
				if (tabs[i].url in published){continue;} // skip. we already published to this tab.
				if (tabs[i].url.startsWith("https://socialstream.ninja/")){continue;}
				if (tabs[i].url.startsWith("chrome-extension")){continue;}
				if (!checkIfAllowed((tabs[i].url))){continue;}
				
				published[tabs[i].url] = true;
				//messageTimeout = Date.now();
				
				if (tabs[i].url.startsWith("https://www.twitch.tv/popout/")){  // twitch, but there's also cases for youtube/facebook
					
					if (!debuggerEnabled[tabs[i].id]){
						debuggerEnabled[tabs[i].id]=false;
						chrome.debugger.attach( { tabId: tabs[i].id },  "1.3", onAttach.bind(null,  { tabId: tabs[i].id }, generalFakeChat, data.response, false, true, false));  // enable the debugger to let us fake a user 
					} else {
						generalFakeChat(tabs[i].id, data.response, false, true, false);
					}
				} else if (tabs[i].url.startsWith("https://app.chime.aws/meetings/")){  // twitch, but there's also cases for youtube/facebook
					if (!debuggerEnabled[tabs[i].id]){
						debuggerEnabled[tabs[i].id]=false;
						chrome.debugger.attach( { tabId: tabs[i].id },  "1.3", onAttach.bind(null,  { tabId: tabs[i].id }, generalFakeChat, data.response, false, true, true));  // enable the debugger to let us fake a user 
					} else {
						generalFakeChat(tabs[i].id, data.response, false, true, true); // middle=true, keypress=true, backspace=false
					}
				} else {  // all other destinations. ; generic
				
					if (tabs[i].url.includes("youtube.com/live_chat")){
						getYoutubeAvatarImage(tabs[i].url, true); // see if I can pre-cache the channel image, if not loaded.
					}
				
					if (!debuggerEnabled[tabs[i].id]){
						debuggerEnabled[tabs[i].id]=false;
						chrome.debugger.attach( { tabId: tabs[i].id },  "1.3", onAttach.bind(null,  { tabId: tabs[i].id }, generalFakeChat, data.response, true, true, false));  // enable the debugger to let us fake a user 
					} else {
						generalFakeChat(tabs[i].id, data.response, true, true, false);
					}
					
				} 
			} catch(e){
				chrome.runtime.lastError;
				console.log(e);
			}
		}
	});
	return true;
}
	
function generalFakeChat(tabid, message, middle=true, keypress=true, backspace=false){ // fake a user input
	try{
		chrome.tabs.sendMessage(tabid, "focusChat", function(response=false) {
			chrome.runtime.lastError;
			if (!response){
				if (debuggerEnabled[tabid]){
					chrome.debugger.detach({ tabId: tabid }, onDetach.bind(null, { tabId: tabid }));
				}
				return;
			}; // make sure the response is valid, else don't inject text
			
			lastSentMessage = message.replace(/<\/?[^>]+(>|$)/g, ""); // keep a cleaned copy
			lastSentMessage = lastSentMessage.replace(/\s\s+/g, ' ');
			lastSentTimestamp = Date.now();
			lastMessageCounter = 0;
			
			if (backspace){
				chrome.debugger.sendCommand({ tabId:tabid }, "Input.dispatchKeyEvent", {
				   "key": "Backspace",
				   "modifiers": 0,
				   "nativeVirtualKeyCode": 8,
				   "text": "",
				   "type": "rawKeyDown",
				   "unmodifiedText": "",
				   "windowsVirtualKeyCode": 8
				 }, function (e) {
						
						chrome.debugger.sendCommand({ tabId:tabid }, "Input.insertText", { text: message }, function (e) {});
					 
						if (keypress){
							chrome.debugger.sendCommand({ tabId:tabid }, "Input.dispatchKeyEvent", { 
								"type": "keyDown",
								"key": "Enter",
								"code": "Enter",
								"nativeVirtualKeyCode": 13,
								"windowsVirtualKeyCode": 13
							}, function (e) {});
						}
						
						if (middle){
							chrome.debugger.sendCommand({ tabId:tabid }, "Input.dispatchKeyEvent", {
								"type": "char",
								"key": "Enter",
								"text": "\r",
								"code": "Enter",
								"nativeVirtualKeyCode": 13,
								"windowsVirtualKeyCode": 13
							}, function (e) {
								if (!keypress){
									if (debuggerEnabled[tabid]){
										chrome.debugger.detach({ tabId: tabid }, onDetach.bind(null, { tabId: tabid }));
									}
								}
							});
						}
						
						if (keypress){
							chrome.debugger.sendCommand({ tabId:tabid }, "Input.dispatchKeyEvent", {
								"type": "keyUp",
								"key": "Enter",
								"code": "Enter",
								"nativeVirtualKeyCode": 13,
								"windowsVirtualKeyCode": 13
							 }, function (e) {
									if (debuggerEnabled[tabid]){
										chrome.debugger.detach({ tabId: tabid }, onDetach.bind(null, { tabId: tabid }));
									}
								}
							);
						}
					 
				 }	);
			} else {
				
				chrome.debugger.sendCommand({ tabId:tabid }, "Input.insertText", { text: message }, function (e) {});
			
				if (keypress){
					chrome.debugger.sendCommand({ tabId:tabid }, "Input.dispatchKeyEvent", { 
						"type": "keyDown",
						"key": "Enter",
						"code": "Enter",
						"nativeVirtualKeyCode": 13,
						"windowsVirtualKeyCode": 13
					}, function (e) {});
				}
				
				if (middle){
					chrome.debugger.sendCommand({ tabId:tabid }, "Input.dispatchKeyEvent", {
						"type": "char",
						"key": "Enter",
						"text": "\r",
						"code": "Enter",
						"nativeVirtualKeyCode": 13,
						"windowsVirtualKeyCode": 13
					}, function (e) {
						if (!keypress){
							if (debuggerEnabled[tabid]){
								chrome.debugger.detach({ tabId: tabid }, onDetach.bind(null, { tabId: tabid }));
							}
						}
					});
				}
				
				if (keypress){
					chrome.debugger.sendCommand({ tabId:tabid }, "Input.dispatchKeyEvent", {
						"type": "keyUp",
						"key": "Enter",
						"code": "Enter",
						"nativeVirtualKeyCode": 13,
						"windowsVirtualKeyCode": 13
					 }, function (e) {
							if (debuggerEnabled[tabid]){
								chrome.debugger.detach({ tabId: tabid }, onDetach.bind(null, { tabId: tabid }));
							}
						}
					);
				}
			}
			
		});
		
	} catch(e){
		if (debuggerEnabled[tabid]){
			chrome.debugger.detach({ tabId: tabid }, onDetach.bind(null, { tabId: tabid }));
		}
	}
}

async function applyBotActions(data){ // this can be customized to create bot-like auto-responses/actions.
	// data.tid,, => processResponse({tid:N, response:xx})
	if (settings.autohi){
		if (data.chatmessage.toLowerCase() === "hi"){
			if (Date.now() - messageTimeout > 60000){ // respond to "1" with a "1" automatically; at most 1 time per minute.
				messageTimeout = Date.now();
				var msg = {};
				msg.id = data.tid;
				msg.response = "Hi, @"+data.chatname+" !";
				processResponse(msg);
			}
		}
	}
	
	console.log("applyBotActions");
	console.log(data);
	if (settings.joke && (data.chatmessage.toLowerCase() === "!joke")){
		if (Date.now() - messageTimeout > 5100){ 
			var score = parseInt(Math.random()* 378);
			var joke = jokes[score];
			
			messageTimeout = Date.now();
			var msg = {};
			msg.response = "@"+data.chatname+", "+joke["setup"];
			console.log(msg);
			processResponse(msg);
			setTimeout(function(msg, punch){
				msg.response = punch;
				processResponse(msg);
				
			},5000, data, "@"+data.chatname+".. "+joke["punchline"]);
		}
	}
	
	if (settings.sentiment){
		try {
			if (!sentimentAnalysisLoaded){
				loadSentimentAnalysis();
				data.sentiment = inferSentiment(data.chatmessage);
			} else {
				data.sentiment = inferSentiment(data.chatmessage);
			}
		}catch(e){}
	} 
	
	if (settings.comment_background){
		if (!data.backgroundColor){
			data.backgroundColor = "background-color:"+settings.comment_background.value+";";
		}
	}
	if (settings.comment_color){
		if (!data.textColor){
			data.textColor = "color:"+settings.comment_color.value+";";
		}
	}
	if (settings.name_background){
		if (!data.backgroundNameColor){
			data.backgroundNameColor =  "background-color:"+settings.name_background.value+";";
		}
	}
	if (settings.name_color){ // 
		if (!data.textNameColor){
			data.textNameColor =  "color:"+settings.name_color.value+";";
		}
	}
	return data;
}

var MidiInit = false;

try {
	function setupMIDI(MidiInput=false){ // setting up MIDI hotkey support.
		var midiChannel = 1;
		if (MidiInput){
			MidiInput.addListener('controlchange', function(e) {
				midiHotkeysCommand(e.controller.number, e.rawValue);
			});
			
			MidiInput.addListener('noteon', function(e) {
				var note = e.note.name + e.note.octave;
				var velocity = e.velocity || false;
				midiHotkeysNote(note,velocity);
			});
		} else {
			for (var i = 0; i < WebMidi.inputs.length; i++) {
				MidiInput = WebMidi.inputs[i];
				
				MidiInput.addListener('controlchange', function(e) {
					if (settings.midi && isExtensionOn){
						midiHotkeysCommand(e.controller.number, e.rawValue);
					}
				});
				
				MidiInput.addListener('noteon', function(e) {
					if (settings.midi && isExtensionOn){
						var note = e.note.name + e.note.octave;
						var velocity = e.velocity || false;
						midiHotkeysNote(note,velocity);
					}
				});
			}
		}
	}
	
	function toggleMidi(){
		if (!("midi" in settings)){return;}
		if (settings.midi){
			if (MidiInit===false){
				MidiInit=true;
				
				WebMidi.enable().then(() =>{
					setupMIDI();
					WebMidi.addListener("connected", function(e) {
						setupMIDI(e.target._midiInput);
					});
					WebMidi.addListener("disconnected", function(e) {
					});
				});
			} else {
				try {
					WebMidi.enable();
				} catch(e){}
			}
		} else if (MidiInit){
			try {
				WebMidi.disable();
			} catch(e){}
		}
	}
	
} catch(e){console.log(e);}


function midiHotkeysCommand(number, value){ // MIDI control change commands
	if (number == 102 && value == 1){
		respondToAll("1");
	} else if (number == 102 && value == 2){
		respondToAll("LUL");
	} else if (number == 102 && value == 3){
		tellAJoke();
	} else if (number == 102 && value == 4){
		var msg = {};
		msg.forward = false; // clears our featured chat overlay
		sendDataP2P(msg);
	} else if (number == 102){
		if (settings.midiConfig && ((value+"") in settings.midiConfig)){
			var msg = settings.midiConfig[value+""];
			respondToAll(msg);
		}
	}
}

function midiHotkeysNote(note, velocity){
	// In case you want to use NOTES instead of Control Change commands; like if you have a MIDI piano
}

function tellAJoke(){
	var score = parseInt(Math.random()* 378);
	var joke = jokes[score];
	messageTimeout = Date.now();
	var data = {};
	data.response = joke["setup"] + "..  " + joke["punchline"] + " LUL";
	processResponse(data);
}

function respondToAll(msg){
	messageTimeout = Date.now();
	var data = {};
	data.response = msg
	processResponse(data);
}


var jokes = [ // jokes from reddit; sourced from github.
  {
	"id": 1,
	"type": "general",
	"setup": "What did the fish say when it hit the wall?",
	"punchline": "Dam."
  },
  {
	"id": 2,
	"type": "general",
	"setup": "How do you make a tissue dance?",
	"punchline": "You put a little boogie on it."
  },
  {
	"id": 3,
	"type": "general",
	"setup": "What's Forrest Gump's password?",
	"punchline": "1Forrest1"
  },
  {
	"id": 4,
	"type": "general",
	"setup": "What do you call a belt made out of watches?",
	"punchline": "A waist of time."
  },
  {
	"id": 5,
	"type": "general",
	"setup": "Why can't bicycles stand on their own?",
	"punchline": "They are two tired"
  },
  {
	"id": 6,
	"type": "general",
	"setup": "How does a train eat?",
	"punchline": "It goes chew, chew"
  },
  {
	"id": 7,
	"type": "general",
	"setup": "What do you call a singing Laptop",
	"punchline": "A Dell"
  },
  {
	"id": 8,
	"type": "general",
	"setup": "How many lips does a flower have?",
	"punchline": "Tulips"
  },
  {
	"id": 9,
	"type": "general",
	"setup": "How do you organize an outer space party?",
	"punchline": "You planet"
  },
  {
	"id": 10,
	"type": "general",
	"setup": "What kind of shoes does a thief wear?",
	"punchline": "Sneakers"
  },
  {
	"id": 11,
	"type": "general",
	"setup": "What's the best time to go to the dentist?",
	"punchline": "Tooth hurty."
  },
  {
	"id": 12,
	"type": "knock-knock",
	"setup": "Knock knock. \n Who's there? \n A broken pencil. \n A broken pencil who?",
	"punchline": "Never mind. It's pointless."
  },
  {
	"id": 13,
	"type": "knock-knock",
	"setup": "Knock knock. \n Who's there? \n Cows go. \n Cows go who?",
	"punchline": "No, cows go moo."
  },
  {
	"id": 14,
	"type": "knock-knock",
	"setup": "Knock knock. \n Who's there? \n Little old lady. \n Little old lady who?",
	"punchline": "I didn't know you could yodel!"
  },
  {
	"id": 15,
	"type": "programming",
	"setup": "What's the best thing about a Boolean?",
	"punchline": "Even if you're wrong, you're only off by a bit."
  },
  {
	"id": 16,
	"type": "programming",
	"setup": "What's the object-oriented way to become wealthy?",
	"punchline": "Inheritance"
  },
  {
	"id": 17,
	"type": "programming",
	"setup": "Where do programmers like to hangout?",
	"punchline": "The Foo Bar."
  },
  {
	"id": 18,
	"type": "programming",
	"setup": "Why did the programmer quit his job?",
	"punchline": "Because he didn't get arrays."
  },
  {
	"id": 19,
	"type": "general",
	"setup": "Did you hear about the two silk worms in a race?",
	"punchline": "It ended in a tie."
  },
  {
	"id": 20,
	"type": "general",
	"setup": "What do you call a laughing motorcycle?",
	"punchline": "A Yamahahahaha."
  },
  {
	"id": 21,
	"type": "general",
	"setup": "A termite walks into a bar and says...",
	"punchline": "'Where is the bar tended?'"
  },
  {
	"id": 22,
	"type": "general",
	"setup": "What does C.S. Lewis keep at the back of his wardrobe?",
	"punchline": "Narnia business!"
  },
  {
	"id": 23,
	"type": "programming",
	"setup": "Why do programmers always mix up Halloween and Christmas?",
	"punchline": "Because Oct 31 == Dec 25"
  },
  {
	"id": 24,
	"type": "programming",
	"setup": "A SQL query walks into a bar, walks up to two tables and asks...",
	"punchline": "'Can I join you?'"
  },
  {
	"id": 25,
	"type": "programming",
	"setup": "How many programmers does it take to change a lightbulb?",
	"punchline": "None that's a hardware problem"
  },
  {
	"id": 26,
	"type": "programming",
	"setup": "If you put a million monkeys at a million keyboards, one of them will eventually write a Java program",
	"punchline": "the rest of them will write Perl"
  },
  {
	"id": 27,
	"type": "programming",
	"setup": "['hip', 'hip']",
	"punchline": "(hip hip array)"
  },
  {
	"id": 28,
	"type": "programming",
	"setup": "To understand what recursion is...",
	"punchline": "You must first understand what recursion is"
  },
  {
	"id": 29,
	"type": "programming",
	"setup": "There are 10 types of people in this world...",
	"punchline": "Those who understand binary and those who don't"
  },
  {
	"id": 30,
	"type": "general",
	"setup": "What did the duck say when he bought lipstick?",
	"punchline": "Put it on my bill"
  },
  {
	"id": 31,
	"type": "general",
	"setup": "What happens to a frog's car when it breaks down?",
	"punchline": "It gets toad away"
  },
  {
	"id": 32,
	"type": "general",
	"setup": "did you know the first French fries weren't cooked in France?",
	"punchline": "they were cooked in Greece"
  },
  {
	"id": 33,
	"type": "programming",
	"setup": "Which song would an exception sing?",
	"punchline": "Can't catch me - Avicii"
  },
  {
	"id": 34,
	"type": "knock-knock",
	"setup": "Knock knock. \n Who's there? \n Opportunity.",
	"punchline": "That is impossible. Opportunity doesn’t come knocking twice!"
  },
  {
	"id": 35,
	"type": "programming",
	"setup": "Why do Java programmers wear glasses?",
	"punchline": "Because they don't C#"
  },
  {
	"id": 36,
	"type": "general",
	"setup": "Why did the mushroom get invited to the party?",
	"punchline": "Because he was a fungi."
  },
  {
	"id": 37,
	"type": "general",
	"setup": "Why did the mushroom get invited to the party?",
	"punchline": "Because he was a fungi."
  },
  {
	"id": 38,
	"type": "general",
	"setup": "I'm reading a book about anti-gravity...",
	"punchline": "It's impossible to put down"
  },
  {
	"id": 39,
	"type": "general",
	"setup": "If you're American when you go into the bathroom, and American when you come out, what are you when you're in there?",
	"punchline": "European"
  },
  {
	"id": 40,
	"type": "general",
	"setup": "Want to hear a joke about a piece of paper?",
	"punchline": "Never mind...it's tearable"
  },
  {
	"id": 41,
	"type": "general",
	"setup": "I just watched a documentary about beavers.",
	"punchline": "It was the best dam show I ever saw"
  },
  {
	"id": 42,
	"type": "general",
	"setup": "If you see a robbery at an Apple Store...",
	"punchline": "Does that make you an iWitness?"
  },
  {
	"id": 43,
	"type": "general",
	"setup": "A ham sandwhich walks into a bar and orders a beer. The bartender says...",
	"punchline": "I'm sorry, we don't serve food here"
  },
  {
	"id": 44,
	"type": "general",
	"setup": "Why did the Clydesdale give the pony a glass of water?",
	"punchline": "Because he was a little horse"
  },
  {
	"id": 45,
	"type": "general",
	"setup": "If you boil a clown...",
	"punchline": "Do you get a laughing stock?"
  },
  {
	"id": 46,
	"type": "general",
	"setup": "Finally realized why my plant sits around doing nothing all day...",
	"punchline": "He loves his pot."
  },
  {
	"id": 47,
	"type": "general",
	"setup": "Don't look at the eclipse through a colander.",
	"punchline": "You'll strain your eyes."
  },
  {
	"id": 48,
	"type": "general",
	"setup": "I bought some shoes from a drug dealer.",
	"punchline": "I don't know what he laced them with, but I was tripping all day!"
  },
  {
	"id": 49,
	"type": "general",
	"setup": "Why do chicken coops only have two doors?",
	"punchline": "Because if they had four, they would be chicken sedans"
  },
  {
	"id": 50,
	"type": "general",
	"setup": "What do you call a factory that sells passable products?",
	"punchline": "A satisfactory"
  },
  {
	"id": 51,
	"type": "general",
	"setup": "When a dad drives past a graveyard: Did you know that's a popular cemetery?",
	"punchline": "Yep, people are just dying to get in there"
  },
  {
	"id": 52,
	"type": "general",
	"setup": "Why did the invisible man turn down the job offer?",
	"punchline": "He couldn't see himself doing it"
  },
  {
	"id": 53,
	"type": "general",
	"setup": "How do you make holy water?",
	"punchline": "You boil the hell out of it"
  },
  {
	"id": 54,
	"type": "general",
	"setup": "I had a dream that I was a muffler last night.",
	"punchline": "I woke up exhausted!"
  },
  {
	"id": 55,
	"type": "general",
	"setup": "Why is peter pan always flying?",
	"punchline": "Because he neverlands"
  },
  {
	"id": 56,
	"type": "programming",
	"setup": "How do you check if a webpage is HTML5?",
	"punchline": "Try it out on Internet Explorer"
  },
  {
	"id": 57,
	"type": "general",
	"setup": "What do you call a cow with no legs?",
	"punchline": "Ground beef!"
  },
  {
	"id": 58,
	"type": "general",
	"setup": "I dropped a pear in my car this morning.",
	"punchline": "You should drop another one, then you would have a pair."
  },
  {
	"id": 59,
	"type": "general",
	"setup": "Lady: How do I spread love in this cruel world?",
	"punchline": "Random Dude: [...💘]"
  },
  {
	"id": 60,
	"type": "programming",
	"setup": "A user interface is like a joke.",
	"punchline": "If you have to explain it then it is not that good."
  },
  {
	"id": 61,
	"type": "knock-knock",
	"setup": "Knock knock. \n Who's there? \n Hatch. \n Hatch who?",
	"punchline": "Bless you!"
  },
  {
	"id": 62,
	"type": "general",
	"setup": "What do you call sad coffee?",
	"punchline": "Despresso."
  },
  {
	"id": 63,
	"type": "general",
	"setup": "Why did the butcher work extra hours at the shop?",
	"punchline": "To make ends meat."
  },
  {
	"id": 64,
	"type": "general",
	"setup": "Did you hear about the hungry clock?",
	"punchline": "It went back four seconds."
  },
  {
	"id": 65,
	"type": "general",
	"setup": "Well...",
	"punchline": "That’s a deep subject."
  },
  {
	"id": 66,
	"type": "general",
	"setup": "Did you hear the story about the cheese that saved the world?",
	"punchline": "It was legend dairy."
  },
  {
	"id": 67,
	"type": "general",
	"setup": "Did you watch the new comic book movie?",
	"punchline": "It was very graphic!"
  },
  {
	"id": 68,
	"type": "general",
	"setup": "I started a new business making yachts in my attic this year...",
	"punchline": "The sails are going through the roof."
  },
  {
	"id": 69,
	"type": "general",
	"setup": "I got hit in the head by a soda can, but it didn't hurt that much...",
	"punchline": "It was a soft drink."
  },
  {
	"id": 70,
	"type": "general",
	"setup": "I can't tell if i like this blender...",
	"punchline": "It keeps giving me mixed results."
  },
  {
	"id": 71,
	"type": "general",
	"setup": "I couldn't get a reservation at the library...",
	"punchline": "They were fully booked."
  },
  {
	"id": 72,
	"type": "programming",
	"setup": "I was gonna tell you a joke about UDP...",
	"punchline": "...but you might not get it."
  },
  {
	"id": 73,
	"type": "programming",
	"setup": "The punchline often arrives before the set-up.",
	"punchline": "Do you know the problem with UDP jokes?"
  },
  {
	"id": 74,
	"type": "programming",
	"setup": "Why do C# and Java developers keep breaking their keyboards?",
	"punchline": "Because they use a strongly typed language."
  },
  {
	"id": 75,
	"type": "general",
	"setup": "What do you give to a lemon in need?",
	"punchline": "Lemonaid."
  },
  {
	"id": 76,
	"type": "general",
	"setup": "Never take advice from electrons.",
	"punchline": "They are always negative."
  },
  {
	"id": 78,
	"type": "general",
	"setup": "Hey, dad, did you get a haircut?",
	"punchline": "No, I got them all cut."
  },
  {
	"id": 79,
	"type": "general",
	"setup": "What time is it?",
	"punchline": "I don't know... it keeps changing."
  },
  {
	"id": 80,
	"type": "general",
	"setup": "A weasel walks into a bar. The bartender says, \"Wow, I've never served a weasel before. What can I get for you?\"",
	"punchline": "Pop,goes the weasel."
  },
  {
	"id": 81,
	"type": "general",
	"setup": "Bad at golf?",
	"punchline": "Join the club."
  },
  {
	"id": 82,
	"type": "general",
	"setup": "Can a kangaroo jump higher than the Empire State Building?",
	"punchline": "Of course. The Empire State Building can't jump."
  },
  {
	"id": 83,
	"type": "general",
	"setup": "Can February march?",
	"punchline": "No, but April may."
  },
  {
	"id": 84,
	"type": "general",
	"setup": "Can I watch the TV?",
	"punchline": "Yes, but don’t turn it on."
  },
  {
	"id": 85,
	"type": "general",
	"setup": "Dad, can you put my shoes on?",
	"punchline": "I don't think they'll fit me."
  },
  {
	"id": 86,
	"type": "general",
	"setup": "Did you hear about the bread factory burning down?",
	"punchline": "They say the business is toast."
  },
  {
	"id": 87,
	"type": "general",
	"setup": "Did you hear about the chameleon who couldn't change color?",
	"punchline": "They had a reptile dysfunction."
  },
  {
	"id": 88,
	"type": "general",
	"setup": "Did you hear about the cheese factory that exploded in France?",
	"punchline": "There was nothing left but de Brie."
  },
  {
	"id": 89,
	"type": "general",
	"setup": "Did you hear about the cow who jumped over the barbed wire fence?",
	"punchline": "It was udder destruction."
  },
  {
	"id": 90,
	"type": "general",
	"setup": "Did you hear about the guy who invented Lifesavers?",
	"punchline": "They say he made a mint."
  },
  {
	"id": 91,
	"type": "general",
	"setup": "Did you hear about the guy whose whole left side was cut off?",
	"punchline": "He's all right now."
  },
  {
	"id": 92,
	"type": "general",
	"setup": "Did you hear about the kidnapping at school?",
	"punchline": "It's ok, he woke up."
  },
  {
	"id": 93,
	"type": "general",
	"setup": "Did you hear about the Mexican train killer?",
	"punchline": "He had loco motives"
  },
  {
	"id": 94,
	"type": "general",
	"setup": "Did you hear about the new restaurant on the moon?",
	"punchline": "The food is great, but there’s just no atmosphere."
  },
  {
	"id": 95,
	"type": "general",
	"setup": "Did you hear about the runner who was criticized?",
	"punchline": "He just took it in stride"
  },
  {
	"id": 96,
	"type": "general",
	"setup": "Did you hear about the scientist who was lab partners with a pot of boiling water?",
	"punchline": "He had a very esteemed colleague."
  },
  {
	"id": 97,
	"type": "general",
	"setup": "Did you hear about the submarine industry?",
	"punchline": "It really took a dive..."
  },
  {
	"id": 98,
	"type": "general",
	"setup": "Did you hear that David lost his ID in prague?",
	"punchline": "Now we just have to call him Dav."
  },
  {
	"id": 99,
	"type": "general",
	"setup": "Did you hear that the police have a warrant out on a midget psychic ripping people off?",
	"punchline": "It reads \"Small medium at large.\""
  },
  {
	"id": 100,
	"type": "general",
	"setup": "Did you hear the joke about the wandering nun?",
	"punchline": "She was a roman catholic."
  },
  {
	"id": 101,
	"type": "general",
	"setup": "Did you hear the news?",
	"punchline": "FedEx and UPS are merging. They’re going to go by the name Fed-Up from now on."
  },
  {
	"id": 102,
	"type": "general",
	"setup": "Did you hear the one about the guy with the broken hearing aid?",
	"punchline": "Neither did he."
  },
  {
	"id": 103,
	"type": "general",
	"setup": "Did you know crocodiles could grow up to 15 feet?",
	"punchline": "But most just have 4."
  },
  {
	"id": 104,
	"type": "general",
	"setup": "What do ghosts call their true love?",
	"punchline": "Their ghoul-friend"
  },
  {
	"id": 105,
	"type": "general",
	"setup": "Did you know that protons have mass?",
	"punchline": "I didn't even know they were catholic."
  },
  {
	"id": 106,
	"type": "general",
	"setup": "Did you know you should always take an extra pair of pants golfing?",
	"punchline": "Just in case you get a hole in one."
  },
  {
	"id": 107,
	"type": "general",
	"setup": "Do I enjoy making courthouse puns?",
	"punchline": "Guilty"
  },
  {
	"id": 108,
	"type": "general",
	"setup": "Do you know where you can get chicken broth in bulk?",
	"punchline": "The stock market."
  },
  {
	"id": 109,
	"type": "general",
	"setup": "Do you want a brief explanation of what an acorn is?",
	"punchline": "In a nutshell, it's an oak tree."
  },
  {
	"id": 110,
	"type": "general",
	"setup": "Ever wondered why bees hum?",
	"punchline": "It's because they don't know the words."
  },
  {
	"id": 111,
	"type": "general",
	"setup": "Have you ever heard of a music group called Cellophane?",
	"punchline": "They mostly wrap."
  },
  {
	"id": 112,
	"type": "general",
	"setup": "Have you heard of the band 1023MB?",
	"punchline": "They haven't got a gig yet."
  },
  {
	"id": 113,
	"type": "general",
	"setup": "Have you heard the rumor going around about butter?",
	"punchline": "Never mind, I shouldn't spread it."
  },
  {
	"id": 114,
	"type": "general",
	"setup": "How are false teeth like stars?",
	"punchline": "They come out at night!"
  },
  {
	"id": 115,
	"type": "general",
	"setup": "How can you tell a vampire has a cold?",
	"punchline": "They start coffin."
  },
  {
	"id": 116,
	"type": "general",
	"setup": "How come a man driving a train got struck by lightning?",
	"punchline": "He was a good conductor."
  },
  {
	"id": 117,
	"type": "general",
	"setup": "How come the stadium got hot after the game?",
	"punchline": "Because all of the fans left."
  },
  {
	"id": 118,
	"type": "general",
	"setup": "How did Darth Vader know what Luke was getting for Christmas?",
	"punchline": "He felt his presents."
  },
  {
	"id": 119,
	"type": "general",
	"setup": "How did the hipster burn the roof of his mouth?",
	"punchline": "He ate the pizza before it was cool."
  },
  {
	"id": 120,
	"type": "general",
	"setup": "How do hens stay fit?",
	"punchline": "They always egg-cercise!"
  },
  {
	"id": 121,
	"type": "general",
	"setup": "How do locomotives know where they're going?",
	"punchline": "Lots of training"
  },
  {
	"id": 122,
	"type": "general",
	"setup": "How do the trees get on the internet?",
	"punchline": "They log on."
  },
  {
	"id": 123,
	"type": "general",
	"setup": "How do you find Will Smith in the snow?",
	"punchline": " Look for fresh prints."
  },
  {
	"id": 124,
	"type": "general",
	"setup": "How do you fix a broken pizza?",
	"punchline": "With tomato paste."
  },
  {
	"id": 125,
	"type": "general",
	"setup": "How do you fix a damaged jack-o-lantern?",
	"punchline": "You use a pumpkin patch."
  },
  {
	"id": 126,
	"type": "general",
	"setup": "How do you get a baby alien to sleep?",
	"punchline": " You rocket."
  },
  {
	"id": 127,
	"type": "general",
	"setup": "How do you get two whales in a car?",
	"punchline": "Start in England and drive West."
  },
  {
	"id": 128,
	"type": "general",
	"setup": "How do you know if there’s an elephant under your bed?",
	"punchline": "Your head hits the ceiling!"
  },
  {
	"id": 129,
	"type": "general",
	"setup": "How do you make a hankie dance?",
	"punchline": "Put a little boogie in it."
  },
  {
	"id": 130,
	"type": "general",
	"setup": "How do you make holy water?",
	"punchline": "You boil the hell out of it."
  },
  {
	"id": 131,
	"type": "general",
	"setup": "How do you organize a space party?",
	"punchline": "You planet."
  },
  {
	"id": 132,
	"type": "general",
	"setup": "How do you steal a coat?",
	"punchline": "You jacket."
  },
  {
	"id": 133,
	"type": "general",
	"setup": "How do you tell the difference between a crocodile and an alligator?",
	"punchline": "You will see one later and one in a while."
  },
  {
	"id": 134,
	"type": "general",
	"setup": "How does a dyslexic poet write?",
	"punchline": "Inverse."
  },
  {
	"id": 135,
	"type": "general",
	"setup": "How does a French skeleton say hello?",
	"punchline": "Bone-jour."
  },
  {
	"id": 136,
	"type": "general",
	"setup": "How does a penguin build it’s house?",
	"punchline": "Igloos it together."
  },
  {
	"id": 137,
	"type": "general",
	"setup": "How does a scientist freshen their breath?",
	"punchline": "With experi-mints!"
  },
  {
	"id": 138,
	"type": "general",
	"setup": "How does the moon cut his hair?",
	"punchline": "Eclipse it."
  },
  {
	"id": 139,
	"type": "general",
	"setup": "How many apples grow on a tree?",
	"punchline": "All of them!"
  },
  {
	"id": 140,
	"type": "general",
	"setup": "How many bones are in the human hand?",
	"punchline": "A handful of them."
  },
  {
	"id": 141,
	"type": "general",
	"setup": "How many hipsters does it take to change a lightbulb?",
	"punchline": "Oh, it's a really obscure number. You've probably never heard of it."
  },
  {
	"id": 142,
	"type": "general",
	"setup": "How many kids with ADD does it take to change a lightbulb?",
	"punchline": "Let's go ride bikes!"
  },
  {
	"id": 143,
	"type": "general",
	"setup": "How many optometrists does it take to change a light bulb?",
	"punchline": "1 or 2? 1... or 2?"
  },
  {
	"id": 144,
	"type": "general",
	"setup": "How many seconds are in a year?",
	"punchline": "12. January 2nd, February 2nd, March 2nd, April 2nd.... etc"
  },
  {
	"id": 145,
	"type": "general",
	"setup": "How many South Americans does it take to change a lightbulb?",
	"punchline": "A Brazilian"
  },
  {
	"id": 146,
	"type": "general",
	"setup": "How many tickles does it take to tickle an octopus?",
	"punchline": "Ten-tickles!"
  },
  {
	"id": 147,
	"type": "general",
	"setup": "How much does a hipster weigh?",
	"punchline": "An instagram."
  },
  {
	"id": 148,
	"type": "general",
	"setup": "How was the snow globe feeling after the storm?",
	"punchline": "A little shaken."
  },
  {
	"id": 149,
	"type": "general",
	"setup": "Is the pool safe for diving?",
	"punchline": "It deep ends."
  },
  {
	"id": 150,
	"type": "general",
	"setup": "Is there a hole in your shoe?",
	"punchline": "No… Then how’d you get your foot in it?"
  },
  {
	"id": 151,
	"type": "general",
	"setup": "What did the spaghetti say to the other spaghetti?",
	"punchline": "Pasta la vista, baby!"
  },
  {
	"id": 152,
	"type": "general",
	"setup": "What’s 50 Cent’s name in Zimbabwe?",
	"punchline": "200 Dollars."
  },
  {
	"id": 153,
	"type": "general",
	"setup": "Want to hear a chimney joke?",
	"punchline": "Got stacks of em! First one's on the house"
  },
  {
	"id": 154,
	"type": "general",
	"setup": "Want to hear a joke about construction?",
	"punchline": "Nah, I'm still working on it."
  },
  {
	"id": 155,
	"type": "general",
	"setup": "Want to hear my pizza joke?",
	"punchline": "Never mind, it's too cheesy."
  },
  {
	"id": 156,
	"type": "general",
	"setup": "What animal is always at a game of cricket?",
	"punchline": "A bat."
  },
  {
	"id": 157,
	"type": "general",
	"setup": "What are the strongest days of the week?",
	"punchline": "Saturday and Sunday...the rest are weekdays."
  },
  {
	"id": 158,
	"type": "general",
	"setup": "What biscuit does a short person like?",
	"punchline": "Shortbread. "
  },
  {
	"id": 159,
	"type": "general",
	"setup": "What cheese can never be yours?",
	"punchline": "Nacho cheese."
  },
  {
	"id": 160,
	"type": "general",
	"setup": "What creature is smarter than a talking parrot?",
	"punchline": "A spelling bee."
  },
  {
	"id": 161,
	"type": "general",
	"setup": "What did celery say when he broke up with his girlfriend?",
	"punchline": "She wasn't right for me, so I really don't carrot all."
  },
  {
	"id": 162,
	"type": "general",
	"setup": "What did Michael Jackson name his denim store?",
	"punchline": "   Billy Jeans!"
  },
  {
	"id": 163,
	"type": "general",
	"setup": "What did one nut say as he chased another nut?",
	"punchline": " I'm a cashew!"
  },
  {
	"id": 164,
	"type": "general",
	"setup": "What did one plate say to the other plate?",
	"punchline": "Dinner is on me!"
  },
  {
	"id": 165,
	"type": "general",
	"setup": "What did one snowman say to the other snow man?",
	"punchline": "Do you smell carrot?"
  },
  {
	"id": 166,
	"type": "general",
	"setup": "What did one wall say to the other wall?",
	"punchline": "I'll meet you at the corner!"
  },
  {
	"id": 167,
	"type": "general",
	"setup": "What did Romans use to cut pizza before the rolling cutter was invented?",
	"punchline": "Lil Caesars"
  },
  {
	"id": 168,
	"type": "general",
	"setup": "What did the 0 say to the 8?",
	"punchline": "Nice belt."
  },
  {
	"id": 169,
	"type": "general",
	"setup": "What did the beaver say to the tree?",
	"punchline": "It's been nice gnawing you."
  },
  {
	"id": 170,
	"type": "general",
	"setup": "What did the big flower say to the littler flower?",
	"punchline": "Hi, bud!"
  },
  {
	"id": 180,
	"type": "general",
	"setup": "What did the Buffalo say to his little boy when he dropped him off at school?",
	"punchline": "Bison."
  },
  {
	"id": 181,
	"type": "general",
	"setup": "What did the digital clock say to the grandfather clock?",
	"punchline": "Look, no hands!"
  },
  {
	"id": 182,
	"type": "general",
	"setup": "What did the dog say to the two trees?",
	"punchline": "Bark bark."
  },
  {
	"id": 183,
	"type": "general",
	"setup": "What did the Dorito farmer say to the other Dorito farmer?",
	"punchline": "Cool Ranch!"
  },
  {
	"id": 184,
	"type": "general",
	"setup": "What did the fish say when it swam into a wall?",
	"punchline": "Damn!"
  },
  {
	"id": 185,
	"type": "general",
	"setup": "What did the grape do when he got stepped on?",
	"punchline": "He let out a little wine."
  },
  {
	"id": 186,
	"type": "general",
	"setup": "What did the judge say to the dentist?",
	"punchline": "Do you swear to pull the tooth, the whole tooth and nothing but the tooth?"
  },
  {
	"id": 187,
	"type": "general",
	"setup": "What did the late tomato say to the early tomato?",
	"punchline": "I’ll ketch up"
  },
  {
	"id": 188,
	"type": "general",
	"setup": "What did the left eye say to the right eye?",
	"punchline": "Between us, something smells!"
  },
  {
	"id": 189,
	"type": "general",
	"setup": "What did the mountain climber name his son?",
	"punchline": "Cliff."
  },
  {
	"id": 189,
	"type": "general",
	"setup": "What did the ocean say to the beach?",
	"punchline": "Thanks for all the sediment."
  },
  {
	"id": 190,
	"type": "general",
	"setup": "What did the ocean say to the shore?",
	"punchline": "Nothing, it just waved."
  },
  {
	"id": 191,
	"type": "general",
	"setup": "Why don't you find hippopotamuses hiding in trees?",
	"punchline": "They're really good at it."
  },
  {
	"id": 192,
	"type": "general",
	"setup": "What did the pirate say on his 80th birthday?",
	"punchline": "Aye Matey!"
  },
  {
	"id": 193,
	"type": "general",
	"setup": "What did the Red light say to the Green light?",
	"punchline": "Don't look at me I'm changing!"
  },
  {
	"id": 194,
	"type": "general",
	"setup": "What did the scarf say to the hat?",
	"punchline": "You go on ahead, I am going to hang around a bit longer."
  },
  {
	"id": 195,
	"type": "general",
	"setup": "What did the shy pebble wish for?",
	"punchline": "That she was a little boulder."
  },
  {
	"id": 196,
	"type": "general",
	"setup": "What did the traffic light say to the car as it passed?",
	"punchline": "Don't look I'm changing!"
  },
  {
	"id": 197,
	"type": "general",
	"setup": "What did the Zen Buddist say to the hotdog vendor?",
	"punchline": "Make me one with everything."
  },
  {
	"id": 198,
	"type": "general",
	"setup": "What do birds give out on Halloween?",
	"punchline": "Tweets."
  },
  {
	"id": 199,
	"type": "general",
	"setup": "What do I look like?",
	"punchline": "A JOKE MACHINE!?"
  },
  {
	"id": 200,
	"type": "general",
	"setup": "What do prisoners use to call each other?",
	"punchline": "Cell phones."
  },
  {
	"id": 201,
	"type": "general",
	"setup": "What do vegetarian zombies eat?",
	"punchline": "Grrrrrainnnnnssss."
  },
  {
	"id": 202,
	"type": "general",
	"setup": "What do you call a bear with no teeth?",
	"punchline": "A gummy bear!"
  },
  {
	"id": 203,
	"type": "general",
	"setup": "What do you call a bee that lives in America?",
	"punchline": "A USB."
  },
  {
	"id": 204,
	"type": "general",
	"setup": "What do you call a boomerang that won't come back?",
	"punchline": "A stick."
  },
  {
	"id": 205,
	"type": "general",
	"setup": "What do you call a careful wolf?",
	"punchline": "Aware wolf."
  },
  {
	"id": 206,
	"type": "general",
	"setup": "What do you call a cow on a trampoline?",
	"punchline": "A milk shake!"
  },
  {
	"id": 207,
	"type": "general",
	"setup": "What do you call a cow with no legs?",
	"punchline": "Ground beef."
  },
  {
	"id": 208,
	"type": "general",
	"setup": "What do you call a cow with two legs?",
	"punchline": "Lean beef."
  },
  {
	"id": 209,
	"type": "general",
	"setup": "What do you call a crowd of chess players bragging about their wins in a hotel lobby?",
	"punchline": "Chess nuts boasting in an open foyer."
  },
  {
	"id": 210,
	"type": "general",
	"setup": "What do you call a dad that has fallen through the ice?",
	"punchline": "A Popsicle."
  },
  {
	"id": 211,
	"type": "general",
	"setup": "What do you call a dictionary on drugs?",
	"punchline": "High definition."
  },
  {
	"id": 212,
	"type": "general",
	"setup": "what do you call a dog that can do magic tricks?",
	"punchline": "a labracadabrador"
  },
  {
	"id": 213,
	"type": "general",
	"setup": "What do you call a droid that takes the long way around?",
	"punchline": "R2 detour."
  },
  {
	"id": 214,
	"type": "general",
	"setup": "What do you call a duck that gets all A's?",
	"punchline": "A wise quacker."
  },
  {
	"id": 215,
	"type": "general",
	"setup": "What do you call a fake noodle?",
	"punchline": "An impasta."
  },
  {
	"id": 216,
	"type": "general",
	"setup": "What do you call a fashionable lawn statue with an excellent sense of rhythmn?",
	"punchline": "A metro-gnome"
  },
  {
	"id": 217,
	"type": "general",
	"setup": "What do you call a fat psychic?",
	"punchline": "A four-chin teller."
  },
  {
	"id": 218,
	"type": "general",
	"setup": "What do you call a fly without wings?",
	"punchline": "A walk."
  },
  {
	"id": 219,
	"type": "general",
	"setup": "What do you call a girl between two posts?",
	"punchline": "Annette."
  },
  {
	"id": 220,
	"type": "general",
	"setup": "What do you call a group of disorganized cats?",
	"punchline": "A cat-tastrophe."
  },
  {
	"id": 221,
	"type": "general",
	"setup": "What do you call a group of killer whales playing instruments?",
	"punchline": "An Orca-stra."
  },
  {
	"id": 222,
	"type": "general",
	"setup": "What do you call a monkey in a mine field?",
	"punchline": "A babooooom!"
  },
  {
	"id": 223,
	"type": "general",
	"setup": "What do you call a nervous javelin thrower?",
	"punchline": "Shakespeare."
  },
  {
	"id": 224,
	"type": "general",
	"setup": "What do you call a pig that knows karate?",
	"punchline": "A pork chop!"
  },
  {
	"id": 225,
	"type": "general",
	"setup": "What do you call a pig with three eyes?",
	"punchline": "Piiig"
  },
  {
	"id": 226,
	"type": "general",
	"setup": "What do you call a pile of cats?",
	"punchline": " A Meowtain."
  },
  {
	"id": 227,
	"type": "general",
	"setup": "What do you call a sheep with no legs?",
	"punchline": "A cloud."
  },
  {
	"id": 228,
	"type": "general",
	"setup": "What do you call a troublesome Canadian high schooler?",
	"punchline": "A poutine."
  },
  {
	"id": 229,
	"type": "general",
	"setup": "What do you call an alligator in a vest?",
	"punchline": "An in-vest-igator!"
  },
  {
	"id": 230,
	"type": "general",
	"setup": "What do you call an Argentinian with a rubber toe?",
	"punchline": "Roberto"
  },
  {
	"id": 231,
	"type": "general",
	"setup": "What do you call an eagle who can play the piano?",
	"punchline": "Talonted!"
  },
  {
	"id": 232,
	"type": "general",
	"setup": "What do you call an elephant that doesn’t matter?",
	"punchline": "An irrelephant."
  },
  {
	"id": 233,
	"type": "general",
	"setup": "What do you call an old snowman?",
	"punchline": "Water."
  },
  {
	"id": 234,
	"type": "general",
	"setup": "What do you call cheese by itself?",
	"punchline": "Provolone."
  },
  {
	"id": 235,
	"type": "general",
	"setup": "What do you call corn that joins the army?",
	"punchline": "Kernel."
  },
  {
	"id": 236,
	"type": "general",
	"setup": "What do you call someone with no nose?",
	"punchline": "Nobody knows."
  },
  {
	"id": 237,
	"type": "general",
	"setup": "What do you call two barracuda fish?",
	"punchline": " A Pairacuda!"
  },
  {
	"id": 238,
	"type": "general",
	"setup": "What do you do on a remote island?",
	"punchline": "Try and find the TV island it belongs to."
  },
  {
	"id": 239,
	"type": "general",
	"setup": "What do you do when you see a space man?",
	"punchline": "Park your car, man."
  },
  {
	"id": 240,
	"type": "general",
	"setup": "What do you get hanging from Apple trees?",
	"punchline": "Sore arms."
  },
  {
	"id": 241,
	"type": "general",
	"setup": "What do you get when you cross a bee and a sheep?",
	"punchline": "A bah-humbug."
  },
  {
	"id": 242,
	"type": "general",
	"setup": "What do you get when you cross a chicken with a skunk?",
	"punchline": "A fowl smell!"
  },
  {
	"id": 243,
	"type": "general",
	"setup": "What do you get when you cross a rabbit with a water hose?",
	"punchline": "Hare spray."
  },
  {
	"id": 244,
	"type": "general",
	"setup": "What do you get when you cross a snowman with a vampire?",
	"punchline": "Frostbite."
  },
  {
	"id": 245,
	"type": "general",
	"setup": "What do you give a sick lemon?",
	"punchline": "Lemonaid."
  },
  {
	"id": 246,
	"type": "general",
	"setup": "What does a clock do when it's hungry?",
	"punchline": "It goes back four seconds!"
  },
  {
	"id": 247,
	"type": "general",
	"setup": "What does a female snake use for support?",
	"punchline": "A co-Bra!"
  },
  {
	"id": 248,
	"type": "general",
	"setup": "What does a pirate pay for his corn?",
	"punchline": "A buccaneer!"
  },
  {
	"id": 249,
	"type": "general",
	"setup": "What does an angry pepper do?",
	"punchline": "It gets jalapeño face."
  },
  {
	"id": 250,
	"type": "general",
	"setup": "What happens to a frog's car when it breaks down?",
	"punchline": "It gets toad."
  },
  {
	"id": 251,
	"type": "general",
	"setup": "What happens when you anger a brain surgeon?",
	"punchline": "They will give you a piece of your mind."
  },
  {
	"id": 252,
	"type": "general",
	"setup": "What has ears but cannot hear?",
	"punchline": "A field of corn."
  },
  {
	"id": 253,
	"type": "general",
	"setup": "What is a centipedes's favorite Beatle song?",
	"punchline": " I want to hold your hand, hand, hand, hand..."
  },
  {
	"id": 254,
	"type": "general",
	"setup": "What is a tornado's favorite game to play?",
	"punchline": "Twister!"
  },
  {
	"id": 255,
	"type": "general",
	"setup": "What is a vampire's favorite fruit?",
	"punchline": "A blood orange."
  },
  {
	"id": 256,
	"type": "general",
	"setup": "What is a witch's favorite subject in school?",
	"punchline": "Spelling!"
  },
  {
	"id": 257,
	"type": "general",
	"setup": "What is red and smells like blue paint?",
	"punchline": "Red paint!"
  },
  {
	"id": 258,
	"type": "general",
	"setup": "What is the difference between ignorance and apathy?",
	"punchline": "I don't know and I don't care."
  },
  {
	"id": 259,
	"type": "general",
	"setup": "What is the hardest part about sky diving?",
	"punchline": "The ground."
  },
  {
	"id": 260,
	"type": "general",
	"setup": "What is the leading cause of dry skin?",
	"punchline": "Towels"
  },
  {
	"id": 261,
	"type": "general",
	"setup": "What is the least spoken language in the world?",
	"punchline": "Sign Language"
  },
  {
	"id": 262,
	"type": "general",
	"setup": "What is the tallest building in the world?",
	"punchline": "The library, it’s got the most stories!"
  },
  {
	"id": 263,
	"type": "general",
	"setup": "What is this movie about?",
	"punchline": "It is about 2 hours long."
  },
  {
	"id": 264,
	"type": "general",
	"setup": "What kind of award did the dentist receive?",
	"punchline": "A little plaque."
  },
  {
	"id": 265,
	"type": "general",
	"setup": "What kind of bagel can fly?",
	"punchline": "A plain bagel."
  },
  {
	"id": 266,
	"type": "general",
	"setup": "What kind of dinosaur loves to sleep?",
	"punchline": "A stega-snore-us."
  },
  {
	"id": 267,
	"type": "general",
	"setup": "What kind of dog lives in a particle accelerator?",
	"punchline": "A Fermilabrador Retriever."
  },
  {
	"id": 268,
	"type": "general",
	"setup": "What kind of magic do cows believe in?",
	"punchline": "MOODOO."
  },
  {
	"id": 269,
	"type": "general",
	"setup": "What kind of music do planets listen to?",
	"punchline": "Nep-tunes."
  },
  {
	"id": 270,
	"type": "general",
	"setup": "What kind of pants do ghosts wear?",
	"punchline": "Boo jeans."
  },
  {
	"id": 271,
	"type": "general",
	"setup": "What kind of tree fits in your hand?",
	"punchline": "A palm tree!"
  },
  {
	"id": 272,
	"type": "general",
	"setup": "What lies at the bottom of the ocean and twitches?",
	"punchline": "A nervous wreck."
  },
  {
	"id": 273,
	"type": "general",
	"setup": "What musical instrument is found in the bathroom?",
	"punchline": "A tuba toothpaste."
  },
  {
	"id": 274,
	"type": "general",
	"setup": "What time did the man go to the dentist?",
	"punchline": "Tooth hurt-y."
  },
  {
	"id": 275,
	"type": "general",
	"setup": "What type of music do balloons hate?",
	"punchline": "Pop music!"
  },
  {
	"id": 276,
	"type": "general",
	"setup": "What was a more important invention than the first telephone?",
	"punchline": "The second one."
  },
  {
	"id": 277,
	"type": "general",
	"setup": "What was the pumpkin’s favorite sport?",
	"punchline": "Squash."
  },
  {
	"id": 278,
	"type": "general",
	"setup": "What's black and white and read all over?",
	"punchline": "The newspaper."
  },
  {
	"id": 279,
	"type": "general",
	"setup": "What's blue and not very heavy?",
	"punchline": " Light blue."
  },
  {
	"id": 280,
	"type": "general",
	"setup": "What's brown and sticky?",
	"punchline": "A stick."
  },
  {
	"id": 281,
	"type": "general",
	"setup": "What's orange and sounds like a parrot?",
	"punchline": "A Carrot."
  },
  {
	"id": 282,
	"type": "general",
	"setup": "What's red and bad for your teeth?",
	"punchline": "A Brick."
  },
  {
	"id": 283,
	"type": "general",
	"setup": "What's the best thing about elevator jokes?",
	"punchline": "They work on so many levels."
  },
  {
	"id": 284,
	"type": "general",
	"setup": "What's the difference between a guitar and a fish?",
	"punchline": "You can tune a guitar but you can't \"tuna\"fish!"
  },
  {
	"id": 285,
	"type": "general",
	"setup": "What's the difference between a hippo and a zippo?",
	"punchline": "One is really heavy, the other is a little lighter."
  },
  {
	"id": 286,
	"type": "general",
	"setup": "What's the difference between a seal and a sea lion?",
	"punchline": "An ion! "
  },
  {
	"id": 287,
	"type": "general",
	"setup": "What's the worst part about being a cross-eyed teacher?",
	"punchline": "They can't control their pupils."
  },
  {
	"id": 288,
	"type": "general",
	"setup": "What's the worst thing about ancient history class?",
	"punchline": "The teachers tend to Babylon."
  },
  {
	"id": 289,
	"type": "general",
	"setup": "What’s brown and sounds like a bell?",
	"punchline": "Dung!"
  },
  {
	"id": 290,
	"type": "general",
	"setup": "What’s E.T. short for?",
	"punchline": "He’s only got little legs."
  },
  {
	"id": 291,
	"type": "general",
	"setup": "What’s Forest Gump’s Facebook password?",
	"punchline": "1forest1"
  },
  {
	"id": 292,
	"type": "general",
	"setup": "What’s the advantage of living in Switzerland?",
	"punchline": "Well, the flag is a big plus."
  },
  {
	"id": 293,
	"type": "general",
	"setup": "What’s the difference between an African elephant and an Indian elephant?",
	"punchline": "About 5000 miles."
  },
  {
	"id": 294,
	"type": "general",
	"setup": "When do doctors get angry?",
	"punchline": "When they run out of patients."
  },
  {
	"id": 295,
	"type": "general",
	"setup": "When does a joke become a dad joke?",
	"punchline": "When it becomes apparent."
  },
  {
	"id": 296,
	"type": "general",
	"setup": "When is a door not a door?",
	"punchline": "When it's ajar."
  },
  {
	"id": 297,
	"type": "general",
	"setup": "Where did you learn to make ice cream?",
	"punchline": "Sunday school."
  },
  {
	"id": 298,
	"type": "general",
	"setup": "Where do bees go to the bathroom?",
	"punchline": " The BP station."
  },
  {
	"id": 299,
	"type": "general",
	"setup": "Where do hamburgers go to dance?",
	"punchline": "The meat-ball."
  },
  {
	"id": 300,
	"type": "general",
	"setup": "Where do rabbits go after they get married?",
	"punchline": "On a bunny-moon."
  },
  {
	"id": 301,
	"type": "general",
	"setup": "Where do sheep go to get their hair cut?",
	"punchline": "The baa-baa shop."
  },
  {
	"id": 302,
	"type": "general",
	"setup": "Where do you learn to make banana splits?",
	"punchline": "At sundae school."
  },
  {
	"id": 303,
	"type": "general",
	"setup": "Where do young cows eat lunch?",
	"punchline": "In the calf-ateria."
  },
  {
	"id": 304,
	"type": "general",
	"setup": "Where does batman go to the bathroom?",
	"punchline": "The batroom."
  },
  {
	"id": 305,
	"type": "general",
	"setup": "Where does Fonzie like to go for lunch?",
	"punchline": "Chick-Fil-Eyyyyyyyy."
  },
  {
	"id": 306,
	"type": "general",
	"setup": "Where does Napoleon keep his armies?",
	"punchline": "In his sleevies."
  },
  {
	"id": 307,
	"type": "general",
	"setup": "Where was the Declaration of Independence signed?",
	"punchline": "At the bottom! "
  },
  {
	"id": 308,
	"type": "general",
	"setup": "Where’s the bin?",
	"punchline": "I haven’t been anywhere!"
  },
  {
	"id": 309,
	"type": "general",
	"setup": "Which side of the chicken has more feathers?",
	"punchline": "The outside."
  },
  {
	"id": 310,
	"type": "general",
	"setup": "Who did the wizard marry?",
	"punchline": "His ghoul-friend"
  },
  {
	"id": 311,
	"type": "general",
	"setup": "Who is the coolest Doctor in the hospital?",
	"punchline": "The hip Doctor!"
  },
  {
	"id": 312,
	"type": "general",
	"setup": "Why are fish easy to weigh?",
	"punchline": "Because they have their own scales."
  },
  {
	"id": 313,
	"type": "general",
	"setup": "Why are fish so smart?",
	"punchline": "Because they live in schools!"
  },
  {
	"id": 314,
	"type": "general",
	"setup": "Why are ghosts bad liars?",
	"punchline": "Because you can see right through them!"
  },
  {
	"id": 315,
	"type": "general",
	"setup": "Why are graveyards so noisy?",
	"punchline": "Because of all the coffin."
  },
  {
	"id": 316,
	"type": "general",
	"setup": "Why are mummys scared of vacation?",
	"punchline": "They're afraid to unwind."
  },
  {
	"id": 317,
	"type": "general",
	"setup": "Why are oranges the smartest fruit?",
	"punchline": "Because they are made to concentrate. "
  },
  {
	"id": 318,
	"type": "general",
	"setup": "Why are pirates called pirates?",
	"punchline": "Because they arrr!"
  },
  {
	"id": 319,
	"type": "general",
	"setup": "Why are skeletons so calm?",
	"punchline": "Because nothing gets under their skin."
  },
  {
	"id": 320,
	"type": "general",
	"setup": "Why can't a bicycle stand on its own?",
	"punchline": "It's two-tired."
  },
  {
	"id": 321,
	"type": "general",
	"setup": "Why can't you use \"Beef stew\"as a password?",
	"punchline": "Because it's not stroganoff."
  },
  {
	"id": 322,
	"type": "general",
	"setup": "Why can't your nose be 12 inches long?",
	"punchline": "Because then it'd be a foot!"
  },
  {
	"id": 323,
	"type": "general",
	"setup": "Why can’t you hear a pterodactyl go to the bathroom?",
	"punchline": "The p is silent."
  },
  {
	"id": 324,
	"type": "general",
	"setup": "Why couldn't the kid see the pirate movie?",
	"punchline": "Because it was rated arrr!"
  },
  {
	"id": 325,
	"type": "general",
	"setup": "Why couldn't the lifeguard save the hippie?",
	"punchline": "He was too far out, man."
  },
  {
	"id": 326,
	"type": "general",
	"setup": "Why did Dracula lie in the wrong coffin?",
	"punchline": "He made a grave mistake."
  },
  {
	"id": 327,
	"type": "general",
	"setup": "Why did Sweden start painting barcodes on the sides of their battleships?",
	"punchline": "So they could Scandinavian."
  },
  {
	"id": 328,
	"type": "general",
	"setup": "Why did the A go to the bathroom and come out as an E?",
	"punchline": "Because he had a vowel movement."
  },
  {
	"id": 329,
	"type": "general",
	"setup": "Why did the barber win the race?",
	"punchline": "He took a short cut."
  },
  {
	"id": 330,
	"type": "general",
	"setup": "Why did the belt go to prison?",
	"punchline": "He held up a pair of pants!"
  },
  {
	"id": 331,
	"type": "general",
	"setup": "Why did the burglar hang his mugshot on the wall?",
	"punchline": "To prove that he was framed!"
  },
  {
	"id": 332,
	"type": "general",
	"setup": "Why did the chicken get a penalty?",
	"punchline": "For fowl play."
  },
  {
	"id": 333,
	"type": "general",
	"setup": "Why did the Clydesdale give the pony a glass of water?",
	"punchline": "Because he was a little horse!"
  },
  {
	"id": 334,
	"type": "general",
	"setup": "Why did the coffee file a police report?",
	"punchline": "It got mugged."
  },
  {
	"id": 335,
	"type": "general",
	"setup": "Why did the cookie cry?",
	"punchline": "Because his mother was a wafer so long"
  },
  {
	"id": 336,
	"type": "general",
	"setup": "Why did the cookie cry?",
	"punchline": "It was feeling crumby."
  },
  {
	"id": 337,
	"type": "general",
	"setup": "Why did the cowboy have a weiner dog?",
	"punchline": "Somebody told him to get a long little doggy."
  },
  {
	"id": 338,
	"type": "general",
	"setup": "Why did the fireman wear red, white, and blue suspenders?",
	"punchline": "To hold his pants up."
  },
  {
	"id": 339,
	"type": "general",
	"setup": "Why did the girl smear peanut butter on the road?",
	"punchline": "To go with the traffic jam."
  },
  {
	"id": 340,
	"type": "general",
	"setup": "Why did the half blind man fall in the well?",
	"punchline": "Because he couldn't see that well!"
  },
  {
	"id": 341,
	"type": "general",
	"setup": "Why did the house go to the doctor?",
	"punchline": "It was having window panes."
  },
  {
	"id": 342,
	"type": "general",
	"setup": "Why did the kid cross the playground?",
	"punchline": "To get to the other slide."
  },
  {
	"id": 343,
	"type": "general",
	"setup": "Why did the man put his money in the freezer?",
	"punchline": "He wanted cold hard cash!"
  },
  {
	"id": 344,
	"type": "general",
	"setup": "Why did the man run around his bed?",
	"punchline": "Because he was trying to catch up on his sleep!"
  },
  {
	"id": 345,
	"type": "general",
	"setup": "Why did the melons plan a big wedding?",
	"punchline": "Because they cantaloupe!"
  },
  {
	"id": 346,
	"type": "general",
	"setup": "Why did the octopus beat the shark in a fight?",
	"punchline": "Because it was well armed."
  },
  {
	"id": 347,
	"type": "general",
	"setup": "Why did the opera singer go sailing?",
	"punchline": "They wanted to hit the high Cs."
  },
  {
	"id": 348,
	"type": "general",
	"setup": "Why did the scarecrow win an award?",
	"punchline": "Because he was outstanding in his field."
  },
  {
	"id": 349,
	"type": "general",
	"setup": "Why did the tomato blush?",
	"punchline": "Because it saw the salad dressing."
  },
  {
	"id": 350,
	"type": "general",
	"setup": "Why did the tree go to the dentist?",
	"punchline": "It needed a root canal."
  },
  {
	"id": 351,
	"type": "general",
	"setup": "Why did the worker get fired from the orange juice factory?",
	"punchline": "Lack of concentration."
  },
  {
	"id": 352,
	"type": "general",
	"setup": "Why didn't the number 4 get into the nightclub?",
	"punchline": "Because he is 2 square."
  },
  {
	"id": 353,
	"type": "general",
	"setup": "Why didn’t the orange win the race?",
	"punchline": "It ran out of juice."
  },
  {
	"id": 354,
	"type": "general",
	"setup": "Why didn’t the skeleton cross the road?",
	"punchline": "Because he had no guts."
  },
  {
	"id": 355,
	"type": "general",
	"setup": "Why do bananas have to put on sunscreen before they go to the beach?",
	"punchline": "Because they might peel!"
  },
  {
	"id": 356,
	"type": "general",
	"setup": "Why do bears have hairy coats?",
	"punchline": "Fur protection."
  },
  {
	"id": 357,
	"type": "general",
	"setup": "Why do bees have sticky hair?",
	"punchline": "Because they use honey combs!"
  },
  {
	"id": 358,
	"type": "general",
	"setup": "Why do bees hum?",
	"punchline": "Because they don't know the words."
  },
  {
	"id": 359,
	"type": "general",
	"setup": "Why do birds fly south for the winter?",
	"punchline": "Because it's too far to walk."
  },
  {
	"id": 360,
	"type": "general",
	"setup": "Why do choirs keep buckets handy?",
	"punchline": "So they can carry their tune"
  },
  {
	"id": 361,
	"type": "general",
	"setup": "Why do crabs never give to charity?",
	"punchline": "Because they’re shellfish."
  },
  {
	"id": 362,
	"type": "general",
	"setup": "Why do ducks make great detectives?",
	"punchline": "They always quack the case."
  },
  {
	"id": 363,
	"type": "general",
	"setup": "Why do mathematicians hate the U.S.?",
	"punchline": "Because it's indivisible."
  },
  {
	"id": 364,
	"type": "general",
	"setup": "Why do pirates not know the alphabet?",
	"punchline": "They always get stuck at \"C\"."
  },
  {
	"id": 365,
	"type": "general",
	"setup": "Why do pumpkins sit on people’s porches?",
	"punchline": "They have no hands to knock on the door."
  },
  {
	"id": 366,
	"type": "general",
	"setup": "Why do scuba divers fall backwards into the water?",
	"punchline": "Because if they fell forwards they’d still be in the boat."
  },
  {
	"id": 367,
	"type": "general",
	"setup": "Why do trees seem suspicious on sunny days?",
	"punchline": "Dunno, they're just a bit shady."
  },
  {
	"id": 368,
	"type": "general",
	"setup": "Why do valley girls hang out in odd numbered groups?",
	"punchline": "Because they can't even."
  },
  {
	"id": 369,
	"type": "general",
	"setup": "Why do wizards clean their teeth three times a day?",
	"punchline": "To prevent bat breath!"
  },
  {
	"id": 370,
	"type": "general",
	"setup": "Why do you never see elephants hiding in trees?",
	"punchline": "Because they're so good at it."
  },
  {
	"id": 371,
	"type": "general",
	"setup": "Why does a chicken coop only have two doors?",
	"punchline": "Because if it had four doors it would be a chicken sedan."
  },
  {
	"id": 372,
	"type": "general",
	"setup": "Why does a Moon-rock taste better than an Earth-rock?",
	"punchline": "Because it's a little meteor."
  },
  {
	"id": 373,
	"type": "general",
	"setup": "Why does it take longer to get from 1st to 2nd base, than it does to get from 2nd to 3rd base?",
	"punchline": "Because there’s a Shortstop in between!"
  },
  {
	"id": 374,
	"type": "general",
	"setup": "Why does Norway have barcodes on their battleships?",
	"punchline": "So when they get back to port, they can Scandinavian."
  },
  {
	"id": 375,
	"type": "general",
	"setup": "Why does Superman get invited to dinners?",
	"punchline": "Because he is a Supperhero."
  },
  {
	"id": 376,
	"type": "general",
	"setup": "Why does Waldo only wear stripes?",
	"punchline": "Because he doesn't want to be spotted."
  },
  {
	"id": 377,
	"type": "programming",
	"setup": "Knock-knock.",
	"punchline": "A race condition. Who is there?"
  },
  {
	"id": 378,
	"type": "programming",
	"setup": "What's the best part about TCP jokes?",
	"punchline": "I get to keep telling them until you get them."
  },
  {
	"id": 379,
	"type": "programming",
	"setup": "A programmer puts two glasses on his bedside table before going to sleep.",
	"punchline": "A full one, in case he gets thirsty, and an empty one, in case he doesn’t."
  },
  {
	"id": 380,
	"type": "programming",
	"setup": "There are 10 kinds of people in this world.",
	"punchline": "Those who understand binary, those who don't, and those who weren't expecting a base 3 joke."
  },
  {
	"id": 381,
	"type": "general",
	"setup": "Two guys walk into a bar . . .",
	"punchline": "The first guy says \"Ouch!\" and the second says \"Yeah, I didn't see it either.\""
  },
  {
	"id": 382,
	"type": "programming",
	"setup": "What did the router say to the doctor?",
	"punchline": "It hurts when IP."
  },
  {
	"id": 383,
	"type": "programming",
	"setup": "An IPv6 packet is walking out of the house.",
	"punchline": "He goes nowhere."
  },
  {
	"id": 384,
	"type": "programming",
	"setup": "A DHCP packet walks into a bar and asks for a beer.",
	"punchline": "Bartender says, \"here, but I’ll need that back in an hour!\""
  },
  {
	"id": 385,
	"type": "programming",
	"setup": "3 SQL statements walk into a NoSQL bar. Soon, they walk out",
	"punchline": "They couldn't find a table."
  },
  {
	"id": 386,
	"type": "general",
	"setup": "I saw a nice stereo on Craigslist for $1. Seller says the volume is stuck on ‘high’",
	"punchline": "I couldn’t turn it down."
  },
  {
	"id": 387,
	"type": "general",
	"setup": "My older brother always tore the last pages of my comic books, and never told me why.",
	"punchline": "I had to draw my own conclusions."
  }
];



