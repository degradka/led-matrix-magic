const socket = new WebSocket('ws://' + window.location.hostname + ':8080');
let selectedColor = '#FF0000';
const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFFFFF', '#FFA500', '#800080', '#008000', '#000000'];
const languages = {
	en: {
		title: "DoodleTron 3000 (wall mounted, it's important)",
		cleanMessage: "Confirm? You might yeet a kitten drawing into the void!",
		yes: "Yup, Nuke It",
		no: "Nah, Save the Art",
		nicknameMessage: "Who’s this pixel wizard?",
		onlineTitle: "Current Doodle Crew",
		leaderboardTitle: "The Coolest",
		galleryTitle: "Hall of Pixel Fame",
	},
	ru: {
		title: "Рисовалка 3000 (настенная, это важно)",
		cleanMessage: "Серьезно? Может, там котик, а ты его уничтожишь!",
		yes: "Точно да",
		no: "Ни за что",
		nicknameMessage: "Кто ты, герой кисточки?",
		onlineTitle: "Кто тут?",
		leaderboardTitle: "Самые крутые",
		galleryTitle: "Зал пиксельной славы",
	}
};
let currentLang = navigator.language.startsWith('en') ? 'en' : 'ru';
if(localStorage.getItem('language')) {
	currentLang = localStorage.getItem('language');
}
updateLanguage();
if(!localStorage.getItem('nickname')) {
	showNicknamePopup();
} else {
	socket.onopen = () => {
		const nickname = localStorage.getItem('nickname');
		socket.send(JSON.stringify({
			command: 'setNickname',
			nickname,
			isReconnect: true
		}));
		console.log('WebSocket opened, nickname sent:', nickname); // Debug
	};
}
// Create color swatches
const colorPicker = document.getElementById('colorPicker');
colors.forEach(color => {
	const swatch = document.createElement('div');
	swatch.className = 'color-swatch';
	swatch.style.backgroundColor = color;
	swatch.addEventListener('click', () => {
		document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
		swatch.classList.add('selected');
		selectedColor = color;
	});
	if(color === selectedColor) swatch.classList.add('selected');
	colorPicker.appendChild(swatch);
});
let currentTool = 'brush';
let brushSize = 1;
const canvas = document.getElementById('matrixCanvas');
const ctx = canvas.getContext('2d');
// Create the grid
for(let y = 0; y < 16; y++) {
	for(let x = 0; x < 16; x++) {
		const pixel = document.createElement('div');
		pixel.className = 'pixel';
		pixel.dataset.x = x;
		pixel.dataset.y = y;
		pixel.addEventListener('click', (e) => handlePixelClick(e, pixel));
		pixel.addEventListener('mousemove', (e) => handlePixelHover(e, pixel));
		document.querySelector('.grid').appendChild(pixel);
	}
}
document.getElementById('brushTool').classList.add('active');

function setTool(tool) {
	currentTool = tool;
	document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
	document.getElementById(`${tool}Tool`).classList.add('active');
	canvas.style.pointerEvents = (tool === 'fill') ? 'auto' : 'none';
	console.log('Tool set to:', tool, 'Brush size:', brushSize); // Enhanced debug
}

function setBrushSize(size) {
	brushSize = parseInt(size);
}

function handlePixelHover(e, pixel) {
	if(currentTool !== 'brush' && currentTool !== 'eraser') return;
	if(e.buttons === 1) { // Left mouse button held
		handlePixelClick(e, pixel);
	}
}

function handlePixelClick(e, pixel) {
	const x = parseInt(pixel.dataset.x);
	const y = parseInt(pixel.dataset.y);
	if(currentTool === 'brush' || currentTool === 'eraser') {
		const color = currentTool === 'eraser' ? '#000000' : selectedColor;
		applyBrush(x, y, color);
	} else if(currentTool === 'picker') {
		selectedColor = pixel.style.backgroundColor || '#000000';
		document.querySelectorAll('.color-swatch').forEach(s => {
			s.classList.toggle('selected', s.style.backgroundColor === selectedColor);
		});
	} else if(currentTool === 'fill') {
		const index = getPhysicalIndex(x, y);
		const currentColor = pixel.style.backgroundColor || '#000000';
		floodFill(x, y, currentColor, selectedColor);
	}
}

function throttle(fn, wait) {
	let lastTime = 0;
	return function(...args) {
		const now = Date.now();
		if(now - lastTime >= wait) {
			lastTime = now;
			fn(...args);
		}
	};
}

function applyBrush(x, y, color) {
	const offsets = {
		1: [
			[0, 0]
		],
		2: [
			[0, 0],
			[0, 1],
			[1, 0],
			[1, 1]
		],
		3: [
			[-1, -1],
			[-1, 0],
			[-1, 1],
			[0, -1],
			[0, 0],
			[0, 1],
			[1, -1],
			[1, 0],
			[1, 1]
		]
	};
	const brushOffsets = offsets[brushSize] || offsets[1];
	console.log('Applying brush:', {
		x, y, brushSize, offsets: brushOffsets.length
	});
	const updates = [];
	brushOffsets.forEach(([dx, dy]) => {
		const newX = x + dx;
		const newY = y + dy;
		if(newX >= 0 && newX < 16 && newY >= 0 && newY < 16) {
			const index = getPhysicalIndex(newX, newY);
			const pixel = document.querySelector(`.pixel[data-x="${newX}"][data-y="${newY}"]`);
			if(pixel) {
				pixel.style.backgroundColor = color;
				updates.push({
					index, color
				});
			} else {
				console.error('Pixel not found at:', {
					newX, newY, index
				});
			}
		} else {
			console.log('Skipped pixel outside grid:', {
				newX, newY
			});
		}
	});
	socket.send(JSON.stringify({
		updates,
		action: 'brush',
			nickname: localStorage.getItem('nickname')
	}));
	console.log('Sent brush batch to server:', updates);
}

function floodFill(x, y, oldColor, newColor) {
	const updates = [];
	fillArea(x, y, oldColor, newColor, updates);
	if(updates.length > 0) {
		socket.send(JSON.stringify({
			updates,
			action: 'fill',
				nickname: localStorage.getItem('nickname')
		}));
		console.log('Sent fill batch to server:', updates);
	}
}

function fillArea(x, y, oldColor, newColor, updates) {
	if(x < 0 || x >= 16 || y < 0 || y >= 16) return;
	const pixel = document.querySelector(`.pixel[data-x="${x}"][data-y="${y}"]`);
	const currentColor = pixel.style.backgroundColor || '#000000';
	if(currentColor !== oldColor || currentColor === newColor) return;
	pixel.style.backgroundColor = newColor;
	const index = getPhysicalIndex(x, y);
	updates.push({
		index, color: newColor
	});
	fillArea(x + 1, y, oldColor, newColor, updates);
	fillArea(x - 1, y, oldColor, newColor, updates);
	fillArea(x, y + 1, oldColor, newColor, updates);
	fillArea(x, y - 1, oldColor, newColor, updates);
}

function setColor(pixel) {
	if(currentTool === 'brush' || currentTool === 'eraser') {
		handlePixelClick(null, pixel);
	}
}

function getPhysicalIndex(x, y) {
	y = 15 - y;
	return y % 2 === 0 ? y * 16 + x : y * 16 + (15 - x);
}

function setColor(pixel) {
	pixel.style.backgroundColor = selectedColor;
	const x = parseInt(pixel.dataset.x);
	const y = parseInt(pixel.dataset.y);
	const index = getPhysicalIndex(x, y);
	socket.send(JSON.stringify({
		index, color: selectedColor, nickname: localStorage.getItem('nickname')
	}));
}

function cleanAll() {
	document.querySelectorAll('.pixel').forEach(pixel => pixel.style.backgroundColor = '#000000');
	socket.send(JSON.stringify({
		effect: 'clean'
	}));
	hideCleanPopup();
}
socket.onmessage = (event) => {
	const data = JSON.parse(event.data);
	if(data.state) {
		const pixels = document.querySelectorAll('.pixel');
		data.state.forEach((color, index) => {
			let y = Math.floor(index / 16);
			let x = (y % 2 === 0) ? (index % 16) : (15 - (index % 16));
			y = 15 - y;
			const gridIndex = y * 16 + x;
			pixels[gridIndex].style.backgroundColor = color;
		});
		// Sync canvas with grid
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		pixels.forEach(pixel => {
			const x = parseInt(pixel.dataset.x);
			const y = parseInt(pixel.dataset.y);
			ctx.fillStyle = pixel.style.backgroundColor || '#000000';
			ctx.fillRect(x, y, 1, 1);
		});
	}
	if(data.onlineUsers) {
		updateOnlineUsers(data.onlineUsers);
	}
	if(data.leaderboard) {
		updateLeaderboard(data.leaderboard);
	}
	if(data.gallery) {
		updateGallery(data.gallery);
	}
	if(data.nicknameStatus) {
		if(data.nicknameStatus === 'success') {
			localStorage.setItem('nickname', data.nickname);
			hideNicknamePopup();
		} else if(data.nicknameStatus === 'taken') {
			if(!document.getElementById('nicknamePopup').style.display || document.getElementById('nicknamePopup').style.display === 'none') {
				localStorage.removeItem('nickname');
				showNicknamePopup();
			} else {
				alert(languages[currentLang].yes === "Yes" ? "This nickname is already taken!" : "Этот никнейм уже занят!");
			}
		}
	}
};
// Theme toggle
function toggleTheme() {
	const body = document.body;
	const themeBtn = document.querySelector('.theme-btn i');
	if(body.classList.contains('light')) {
		body.classList.remove('light');
		themeBtn.classList.replace('fa-sun', 'fa-moon');
		localStorage.setItem('theme', 'dark');
	} else {
		body.classList.add('light');
		themeBtn.classList.replace('fa-moon', 'fa-sun');
		localStorage.setItem('theme', 'light');
	}
}
if(localStorage.getItem('theme') === 'light') {
	document.body.classList.add('light');
	document.querySelector('.theme-btn i').classList.replace('fa-moon', 'fa-sun');
}
// Language toggle
function toggleLanguage() {
	currentLang = currentLang === 'en' ? 'ru' : 'en';
	localStorage.setItem('language', currentLang);
	updateLanguage();
}

function updateLanguage() {
	document.getElementById('title').textContent = languages[currentLang].title;
	document.getElementById('cleanMessage').textContent = languages[currentLang].cleanMessage;
	const cleanYesBtn = document.querySelector('#cleanPopup .popup-btn:not(.cancel)');
	if(cleanYesBtn) cleanYesBtn.textContent = languages[currentLang].yes;
	const cleanNoBtn = document.querySelector('#cleanPopup .popup-btn.cancel');
	if(cleanNoBtn) cleanNoBtn.textContent = languages[currentLang].no;
	document.getElementById('nicknameMessage').textContent = languages[currentLang].nicknameMessage;
	const nicknameOkBtn = document.querySelector('#nicknamePopup .popup-btn');
	if(nicknameOkBtn) nicknameOkBtn.textContent = languages[currentLang].yes;
	document.getElementById('onlineTitle').textContent = languages[currentLang].onlineTitle;
	document.getElementById('leaderboardTitle').textContent = languages[currentLang].leaderboardTitle;
	document.getElementById('galleryTitle').textContent = languages[currentLang].galleryTitle;
}
// Clean popup controls
function showCleanPopup() {
	document.getElementById('cleanPopup').style.display = 'flex';
}

function hideCleanPopup() {
	document.getElementById('cleanPopup').style.display = 'none';
}

function confirmClean() {
	cleanAll();
}
// Nickname popup controls
function showNicknamePopup() {
	document.getElementById('nicknamePopup').style.display = 'flex';
	document.getElementById('nicknameInput').focus();
}

function hideNicknamePopup() {
	document.getElementById('nicknamePopup').style.display = 'none';
}

function saveNickname() {
	const nickname = document.getElementById('nicknameInput').value.trim();
	if(nickname) {
		socket.send(JSON.stringify({
			command: 'setNickname',
			nickname
		}));
		// Wait for server response before hiding popup
	} else {
		alert(languages[currentLang].yes === "Yes" ? "Please enter a nickname!" : "Пожалуйста, введите никнейм!");
	}
}
// Online users display
function updateOnlineUsers(onlineUsers) {
	const list = document.getElementById('onlineList');
	list.innerHTML = '';
	onlineUsers.forEach(user => {
		const li = document.createElement('li');
		li.textContent = user;
		list.appendChild(li);
	});
}
// Leaderboard display
function updateLeaderboard(leaderboard) {
	const list = document.getElementById('leaderboardList');
	list.innerHTML = '';
	leaderboard.forEach(({
		nickname, pixelCount
	}) => {
		const li = document.createElement('li');
		li.textContent = `${nickname}: ${pixelCount}`;
		list.appendChild(li);
	});
}

function saveDrawing() {
	const nickname = localStorage.getItem('nickname') || 'Anonymous';
	socket.send(JSON.stringify({
		command: 'saveDrawing',
		nickname
	}));
}

function updateGallery(gallery) {
	const galleryItems = document.getElementById('galleryItems');
	galleryItems.innerHTML = '';
	gallery.forEach(({
		nickname, state
	}, index) => {
		const item = document.createElement('div');
		item.className = 'gallery-item';
		const canvas = document.createElement('canvas');
		canvas.className = 'gallery-canvas';
		canvas.width = 16;
		canvas.height = 16;
		const ctx = canvas.getContext('2d');
		for(let i = 0; i < state.length; i++) {
			let y = Math.floor(i / 16);
			let x = (y % 2 === 0) ? (i % 16) : (15 - (i % 16)); // Zigzag pattern
			y = 15 - y; // Flip vertically to match matrix
			ctx.fillStyle = state[i];
			ctx.fillRect(x, y, 1, 1);
		}
		const nameSpan = document.createElement('div');
		nameSpan.className = 'gallery-nickname';
		nameSpan.textContent = nickname;
		// Admin delete feature (change according to your nickname)
		if(localStorage.getItem('nickname') === 'YOURNICKNAME') {
			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'gallery-delete-btn';
			deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
			deleteBtn.onclick = () => showDeletePopup(index);
			item.appendChild(deleteBtn);
		}
		item.appendChild(canvas);
		item.appendChild(nameSpan);
		galleryItems.appendChild(item);
	});
}

function showDeletePopup(index) {
	const popup = document.createElement('div');
	popup.className = 'popup';
	popup.innerHTML = `
		<div class="popup-content">
		  <p>${languages[currentLang].yes === "Yes" ? "Are you sure you want to delete this drawing?" : "Вы уверены, что хотите удалить этот рисунок?"}</p>
		  <div class="popup-buttons">
			<button class="popup-btn" onclick="deleteDrawing(${index}); this.parentNode.parentNode.parentNode.remove()">Yes</button>
			<button class="popup-btn cancel" onclick="this.parentNode.parentNode.parentNode.remove()">No</button>
		  </div>
		</div>
	  `;
	document.body.appendChild(popup);
	popup.style.display = 'flex';
}

function deleteDrawing(index) {
	socket.send(JSON.stringify({
		command: 'deleteDrawing',
		index
	}));
}