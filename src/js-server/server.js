const express = require('express');
const WebSocket = require('ws');
const {
	SerialPort
} = require('serialport');
const fs = require('fs').promises;
const isDevMode = process.argv.includes('-dev');
const devLog = (...args) => isDevMode && console.log(...args);
const app = express();
const server = app.listen(3000, '0.0.0.0', () => {
	console.log('Web server running on http://<your-public-ip>:3000');
});
app.use(express.static('public'));
const port = new SerialPort({
	path: 'COM20', // Change the com port as needed
	baudRate: 115200
}, (err) => {
	if(err) return console.log('Serial port error:', err.message);
	console.log('Serial port opened');
});
port.on('open', () => {
	console.log('Serial port connection established');
});
port.on('error', (err) => console.log('Serial error:', err.message));
const USERS_FILE = './users.json';
let users = {};
async function loadUsers() {
	try {
		const data = await fs.readFile(USERS_FILE, 'utf8');
		users = JSON.parse(data);
		console.log('Loaded users from file:', Object.keys(users).length);
	} catch(err) {
		if(err.code === 'ENOENT') {
			console.log('No users file found, starting fresh');
			await saveUsers();
		} else {
			console.log('Error loading users:', err.message);
		}
	}
}
async function saveUsers() {
	try {
		await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
		devLog('Users saved to file');
	} catch(err) {
		console.log('Error saving users:', err.message);
	}
}
loadUsers();
const GALLERY_FILE = './gallery.json';
const STATE_FILE = './ledState.json';
let gallery = [];
let ledState = Array(256).fill('#000000');
async function loadGallery() {
	try {
		const data = await fs.readFile(GALLERY_FILE, 'utf8');
		gallery = JSON.parse(data);
		console.log('Loaded gallery from file:', gallery.length);
	} catch(err) {
		if(err.code === 'ENOENT') {
			console.log('No gallery file found, starting fresh');
			await saveGallery();
		} else {
			console.log('Error loading gallery:', err.message);
		}
	}
}
async function saveGallery() {
	try {
		await fs.writeFile(GALLERY_FILE, JSON.stringify(gallery, null, 2));
		devLog('Gallery saved to file');
	} catch(err) {
		console.log('Error saving gallery:', err.message);
	}
}
async function loadState() {
	try {
		const data = await fs.readFile(STATE_FILE, 'utf8');
		ledState = JSON.parse(data);
		console.log('Loaded LED state from file');
	} catch(err) {
		if(err.code === 'ENOENT') {
			console.log('No LED state file found, starting fresh');
			await saveState();
		} else {
			console.log('Error loading LED state:', err.message);
		}
	}
}
async function saveState() {
	try {
		await fs.writeFile(STATE_FILE, JSON.stringify(ledState, null, 2));
		devLog('LED state saved to file');
	} catch(err) {
		console.log('Error saving LED state:', err.message);
	}
}
loadGallery();
loadState();
port.on('data', (data) => {
	const message = data.toString().trim();
	//devLog('Raw Wemos data:', message); // Log raw input
	try {
		const parsed = JSON.parse(message);
		if(parsed.state) {
			parsed.state.forEach(({
				index, color
			}) => {
				ledState[index] = color;
			});
			devLog('Updated state from Wemos');
			broadcastStateToBrowsers();
		} else if(parsed.command === 'getState') {
			const stateMessage = JSON.stringify({
				state: ledState
			}) + '\n';
			port.write(stateMessage, (err) => {
				if(err) console.log('Error sending state to Wemos:', err.message);
				//devLog('Sent current state to Wemos:', stateMessage);
			});
			// Retry after a short delay to ensure receipt
			setTimeout(() => {
				port.write(stateMessage, (err) => {
					if(err) console.log('Retry error sending state to Wemos:', err.message);
					//devLog('Retried sending current state to Wemos');
				});
			}, 500);
		}
	} catch(e) {
		//devLog('Serial parse error:', e.message, 'Data:', message);
	}
});
const wssBrowser = new WebSocket.Server({
	port: 8080,
	host: '0.0.0.0'
});
wssBrowser.on('connection', (ws) => {
	ws.nickname = 'Anonymous';
	console.log(`${ws.nickname} connected`);
	ws.send(JSON.stringify({
		state: ledState,
		leaderboard: getLeaderboard(),
		gallery
	}));
	port.write(JSON.stringify({
		command: 'getState'
	}) + '\n');
	broadcastOnlineUsers();
	ws.on('message', async(message) => {
		devLog('Received from browser:', message);
		const data = JSON.parse(message);
		if(data.command === 'setNickname' && data.nickname) {
			const currentNickname = ws.nickname;
			const isReconnect = data.isReconnect || false;
			// Check if nickname is actively held by another connection
			const isNicknameTaken = Array.from(wssBrowser.clients).some(client => client !== ws && client.nickname === data.nickname);
			if(data.nickname === 'Федорас') {
				// Hardcode "Федорас" to always succeed
				ws.nickname = 'Федорас';
				if(!users['Федорас']) {
					users['Федорас'] = {
						pixelCount: 0
					};
					await saveUsers();
					devLog('Admin nickname added: Федорас');
				}
				ws.send(JSON.stringify({
					nicknameStatus: 'success',
					nickname: 'Федорас'
				}));
				broadcastOnlineUsers();
				broadcastLeaderboard();
			} else if(isNicknameTaken && currentNickname !== data.nickname) {
				// Only reject if actively taken by another connection
				ws.send(JSON.stringify({
					nicknameStatus: 'taken',
					isReconnect
				}));
			} else {
				// Accept if not taken or it's a reconnect with same nickname
				ws.nickname = data.nickname;
				if(!users[data.nickname]) {
					users[data.nickname] = {
						pixelCount: 0
					};
					await saveUsers();
					devLog('New nickname added:', data.nickname);
				}
				ws.send(JSON.stringify({
					nicknameStatus: 'success',
					nickname: data.nickname
				}));
				broadcastOnlineUsers();
				broadcastLeaderboard();
			}
		}
		if(data.updates) {
			data.updates.forEach(({
				index, color
			}) => {
				ledState[index] = color;
			});
			if(ws.nickname !== 'Anonymous' && data.nickname) {
				// Increment by 1 per action, not per pixel
				users[data.nickname].pixelCount = (users[data.nickname].pixelCount || 0) + 1;
				await saveUsers();
				broadcastLeaderboard();
				devLog('Counted action:', data.action, 'for', data.nickname);
			}
			await saveState();
			broadcastStateToBrowsers();
		} else if(data.index !== undefined && data.color) {
			ledState[data.index] = data.color;
			if(ws.nickname !== 'Anonymous' && data.nickname) {
				users[data.nickname].pixelCount = (users[data.nickname].pixelCount || 0) + 1;
				await saveUsers();
				broadcastLeaderboard();
			}
			await saveState();
			broadcastStateToBrowsers();
		}
		if(data.effect === 'clean') {
			ledState.fill('#000000');
			await saveState();
			broadcastStateToBrowsers();
		}
		if(data.command === 'saveDrawing' && data.nickname) {
			gallery.push({
				nickname: data.nickname,
				state: [...ledState]
			});
			await saveGallery();
			broadcastGallery();
		}
		if(data.command === 'deleteDrawing' && data.index !== undefined && ws.nickname === 'Федорас') {
			gallery.splice(data.index, 1);
			await saveGallery();
			broadcastGallery();
		}
		port.write(JSON.stringify(data) + '\n', (err) => {
			if(err) return console.log('Serial write error:', err.message);
			devLog('Sent to Wemos:', data);
		});
	});
	ws.on('close', () => {
		console.log(`${ws.nickname} disconnected`);
		broadcastOnlineUsers();
	});
});

function broadcastStateToBrowsers() {
	wssBrowser.clients.forEach((client) => {
		if(client.readyState === WebSocket.OPEN) {
			client.send(JSON.stringify({
				state: ledState
			}));
		}
	});
}

function broadcastOnlineUsers() {
	const onlineUsers = Array.from(wssBrowser.clients).map(ws => ws.nickname);
	wssBrowser.clients.forEach((client) => {
		if(client.readyState === WebSocket.OPEN) {
			client.send(JSON.stringify({
				onlineUsers
			}));
		}
	});
}

function getLeaderboard() {
	return Object.entries(users).map(([nickname, {
		pixelCount
	}]) => ({
		nickname, pixelCount
	})).sort((a, b) => b.pixelCount - a.pixelCount).slice(0, 10); // Top 10
}

function broadcastLeaderboard() {
	const leaderboard = getLeaderboard();
	wssBrowser.clients.forEach((client) => {
		if(client.readyState === WebSocket.OPEN) {
			client.send(JSON.stringify({
				leaderboard
			}));
		}
	});
}

function broadcastGallery() {
	wssBrowser.clients.forEach((client) => {
		if(client.readyState === WebSocket.OPEN) {
			client.send(JSON.stringify({
				gallery
			}));
		}
	});
}