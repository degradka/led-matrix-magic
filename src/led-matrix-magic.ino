#include <FastLED.h>
#include <ESP8266WiFi.h>
#include <ESPAsyncWebServer.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>

#define DATA_PIN D4
#define NUM_LEDS 256
#define DEFAULT_BRIGHTNESS 50

const char* ssid = "your_SSID";
const char* password = "your_PASSWORD";

CRGB leds[NUM_LEDS];

AsyncWebServer server(80);
WebSocketsServer webSocket(81);

bool isRainbow = false;
bool isSparkles = false;
static int numSparkles = 0;
bool isBouncingBall = false;

const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <title>LED Matrix Control</title>
  <style>
    body { 
      display: flex; 
      flex-direction: column; 
      align-items: center; 
      justify-content: center; 
    }
    .grid { 
      display: grid; 
      grid-template-columns: repeat(16, 20px); 
      grid-template-rows: repeat(16, 20px); 
      gap: 2px; 
      transform: rotate(270deg); 
    }
    .pixel { 
      width: 20px; 
      height: 20px; 
      background-color: #000; 
      border: 1px solid #333; 
      cursor: pointer; 
    }
    h1 {
      margin-bottom: 20px;
      text-align: center;
    }
    .color-picker {
      margin-bottom: 20px;
    }
    .clean-button {
      margin-top: 20px;
    }
    .preset-effects {
      text-align: center;
    }
  </style>
</head>
<body>
  <h1>degradka's LED Matrix Controller</h1>
  <div class="color-picker">
    <input type="color" id="colorPicker" value="#000000">
  </div>
  <div class="grid">
    <script>
      function cleanAll() {
        let pixels = document.querySelectorAll(".pixel");
        sendPresetEffect('clean');
        pixels.forEach(pixel => {
          pixel.style.backgroundColor = "#000000";
          let x = parseInt(pixel.dataset.x);
          let y = parseInt(pixel.dataset.y);
          let index = getPhysicalIndex(x, y);
        });
      }

      let selectedColor = document.getElementById("colorPicker").value;
      let socket = new WebSocket("ws://" + location.hostname + ":81");

      function sendPresetEffect(effect) {
        socket.send(JSON.stringify({ effect: effect }));
      }

      function setColor(pixel) {
        pixel.style.backgroundColor = selectedColor;
        let x = parseInt(pixel.dataset.x);
        let y = parseInt(pixel.dataset.y);
        let index = getPhysicalIndex(x, y);
        socket.send(JSON.stringify({ index: index, color: selectedColor }));
      }

      function getPhysicalIndex(x, y) {
        y = 15 - y; // Invert the y-axis
        if (y % 2 == 0) {
          return y * 16 + x;
        } else {
          return y * 16 + (15 - x);
        }
      }

      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          let pixel = document.createElement("div");
          pixel.className = "pixel";
          pixel.dataset.x = x;
          pixel.dataset.y = y;
          pixel.addEventListener("click", () => {
            setColor(pixel);
          });
          document.querySelector(".grid").appendChild(pixel);
        }
      }

      socket.onmessage = (event) => {
        let data = JSON.parse(event.data);
        let x = data.index % 16;
        let y = Math.floor(data.index / 16);
        let physicalIndex = getPhysicalIndex(x, y);
        document.querySelectorAll(".pixel")[physicalIndex].style.backgroundColor = data.color;
      };

      document.getElementById("colorPicker").addEventListener("change", (event) => {
        selectedColor = event.target.value;
      });
    </script>
  </div>
  <button class="clean-button" onclick="cleanAll()">Clean All</button>
  <div class="preset-effects">
    <h2>Preset Effects</h2>
    <button onclick="sendPresetEffect('rainbow')">Rainbow</button>
    <button onclick="sendPresetEffect('sparkles')">Sparkles</button>
    <button onclick="sendPresetEffect('bouncingball')">Bouncing Ball</button>
  </div>
</body>
</html>
)rawliteral";

void rainbow() {
  uint8_t sat = 255;
  uint8_t bright = 255;
  static uint8_t hue = 0;
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i] = CHSV(hue + (i * 255 / NUM_LEDS), sat, bright);
  }
  FastLED.show();
  hue++;
  delay(50);
}

void sparkles() {
  if (numSparkles >= NUM_LEDS) {
    FastLED.clear();
    numSparkles = 0;
  }
  int newSparkles = NUM_LEDS * 0.02;
  for (int i = 0; i < newSparkles; i++) {
    int index = random(NUM_LEDS);
    if (leds[index] == CRGB::Black) {
      leds[index] = CRGB::White;
      numSparkles++;
    }
  }
  FastLED.show();
  delay(100);
}

void bouncingBall() {
  static uint8_t hue = 0;
  static int x = 1, y = 1;
  static int dx = 1, dy = 1;
  static int boundary = 15;

  fill_solid(leds, NUM_LEDS, CRGB::Black);

  // Draw the boundaries
  // Right Border
  for (int i = 0; i < 16; i++) {
    leds[i] = CRGB::White;
  }
  //Left border
  for (int i = 240; i < 256; i++) {
    leds[i] = CRGB::White;
  }

  FastLED.show();
  delay(100);
}

void clean() {
    isRainbow = false;
    isSparkles = false;
    isBouncingBall = false;
    FastLED.clear();
    FastLED.show();
}

void onWebSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  if (type == WStype_TEXT) {
    String message = String((char *)payload).substring(0, length);
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, message);

    int index = doc["index"];
    String color = doc["color"];

    long hexColor = strtol(color.c_str() + 1, NULL, 16);
    leds[index] = CRGB(hexColor >> 16, (hexColor >> 8) & 0xFF, hexColor & 0xFF);

    String effect = doc["effect"];

    if (effect == "rainbow") {
      clean();
      isRainbow = true;
    } else if (effect == "sparkles") {
      clean();
      isSparkles = true;
    } else if (effect == "bouncingball") {
      clean();
      isBouncingBall = true;
    } else if (effect == "clean") {
      clean();
    }

    FastLED.show();
  }
}

void setup() {
  IPAddress ip;

  Serial.begin(115200);

  // Connect to Wi-Fi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  Serial.println("Connected to WiFi");

  ip = WiFi.localIP();
  Serial.print("Local IP: ");
  Serial.println(ip);

  // Initialize FastLED
  FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(DEFAULT_BRIGHTNESS);
  FastLED.clear();
  FastLED.show();

  // WebSocket event handler
  webSocket.onEvent(onWebSocketEvent);
  webSocket.begin();

  // Serve the HTML page
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send_P(200, "text/html", index_html);
  });

  server.begin();
}

void loop() {
  webSocket.loop();

  if (isRainbow == true) {
    rainbow();
  } else if (isSparkles == true) {
    sparkles();
  } else if (isBouncingBall == true) {
    bouncingBall();
  }
}