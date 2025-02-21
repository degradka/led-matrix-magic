<div align="center">
  <h1>LED Matrix Magic</h1>
</div>

<div align="center">
  <img src="images/result.jpg" alt="Result" style="width: 40%; height: auto;">
</div>

Welcome to **LED Matrix Magic**! This project turns a 16x16 WS2812B LED matrix into an interactive canvas, controlled via a web interface, using a Wemos D1 Mini and a Node.js server.

## Table of Contents
- [What It Does](#what-it-does)
- [Features](#features)
- [Hardware](#hardware)
- [Software](#software)
- [Setup](#setup)
- [How to Use](#how-to-use)
- [The Result](#the-result)
- [Contributing](#contributing)
- [License](#license)

## What It Does
LED Matrix Magic lets you draw on a 16x16 LED matrix with a web app. The Wemos D1 Mini drives the LEDs over serial, while a Node.js server handles the web interface and syncs everything.

## Features
- Web-based drawing with brush (1x1, 2x2, 3x3), eraser, fill bucket, and color picker.
- Colors!
- Real-time updates between web and LEDs.
- Clean all button to reset the matrix.
- Gallery to save drawings with nicknames.
- Leaderboard tracking actions (1 point per click/fill, not per pixel).
- Dark/light theme toggle and Russian/English support.

## Hardware
- **Wemos D1 Mini** (ESP8266-based).
- **WS2812B LED Strip** (256 LEDs for 16x16).
- **Base Material** (e.g., plywood) to mount LEDs.
- **Power Supply** (5V, 10A recommended for 256 LEDs though it works from pc usb).
- **Wires, Connectors, Soldering Gear**.
- **3D Printed Holders** (STL files in `stl` folder).

<div align="center">
  <img src="images/schematic.png" alt="Connection schematic" style="width: 50%; height: auto;">
</div>

## Software
- **Arduino IDE**: [Download](https://www.arduino.cc/en/Main/Software) for Wemos code.
  - Libraries: `FastLED`, `ArduinoJson` (install via Library Manager).
- **Node.js**: [Download](https://nodejs.org/) for the server.
  - Packages: `express`, `ws`, `serialport` (install with `npm`).

## Setup
1. **Clone the Repo**:
   ```sh
   git clone https://github.com/degradka/led-matrix-magic.git
   cd led-matrix-magic```
2. **Wemos Setup**:
	- Open `led-matrix-magic.ino` in Arduino IDE.
	- Install `FastLED` and `ArduinoJson` via **Sketch > Include Library > Manage Libraries**.
	- Connect Wemos to USB, select board/port in **Tools**, upload the code.
3. **Server Setup**:
	- In the project folder, run: ```npm install express ws serialport```
	- Update `server.js` with your Wemos serial port (e.g., `COM20`): ```const port = new SerialPort({ path: 'COM20', baurdRate: 115200 }, ...);```
	- Update `script.js` with your admin name: ```if(localStorage.getItem('nickname') === 'YOUR ADMIN NICKNAME') {```
	- Start the server: ```node server.js```
4. **Hardware Connections**:
	- WS2812B data pin to Wemos D4, 5V and GND to 5V and GND accordingly.
	- Power Wemos via USB or power supply.

## How to Use
1. Power on the Wemos first.
2. Start `node server.js` - wemos will automatically connect to it.
3. Open http://localhost:3000 (or your server's IP):
	- Pick the same nickname you entered in `script.js`.
	- Use tools: brush (sizes 1-3), eraser, fill bucket, color picker.
	- Save drawings to gallery (admin can manage them).
	- Toggle theme/language, clear matrix with the trash button.

## The Result
<div align="center">
    <img src="images/website_controller.jpg" alt="Website controller" style="width: 50%; height: auto;">
</div>

## Contributing
Got ideas or fixes? Fork the repo, make changes, and send a pull request. All help welcome!

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.