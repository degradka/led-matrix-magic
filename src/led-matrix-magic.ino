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

enum EffectType { NONE, RAINBOW, SPARKLES, BOUNCING_BALL };
EffectType currentEffect = NONE;
static int numSparkles = 0;

const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
<title>LED Matrix Control</title>
<style>body{display:flex;flex-direction:column;align-items:center;justify-content:center}.grid{display:grid;grid-template-columns:repeat(16,20px);grid-template-rows:repeat(16,20px);gap:2px;transform:rotate(270deg)}.pixel{width:20px;height:20px;background-color:#000;border:1px solid #333;cursor:pointer}h1{margin-bottom:20px;text-align:center}.color-picker{margin-bottom:20px}.clean-button{margin-top:20px}.preset-effects{text-align:center}</style>
</head>
<body>
<h1>degradka's LED Matrix Controller</h1>
<div class=color-picker>
<input type=color id=colorPicker value=#000000>
</div>
<div class=grid>
<script>function cleanAll(){let pixels=document.querySelectorAll(".pixel");sendPresetEffect('clean');pixels.forEach(pixel=>{pixel.style.backgroundColor="#000000";let x=parseInt(pixel.dataset.x);let y=parseInt(pixel.dataset.y);let index=getPhysicalIndex(x,y);});}
let selectedColor=document.getElementById("colorPicker").value;let socket=new WebSocket("ws://"+location.hostname+":81");function sendPresetEffect(effect){socket.send(JSON.stringify({effect:effect}));}
function setColor(pixel){pixel.style.backgroundColor=selectedColor;let x=parseInt(pixel.dataset.x);let y=parseInt(pixel.dataset.y);let index=getPhysicalIndex(x,y);socket.send(JSON.stringify({index:index,color:selectedColor}));}
function getPhysicalIndex(x,y){y=15-y;if(y%2==0){return y*16+x;}else{return y*16+(15-x);}}
for(let y=0;y<16;y++){for(let x=0;x<16;x++){let pixel=document.createElement("div");pixel.className="pixel";pixel.dataset.x=x;pixel.dataset.y=y;pixel.addEventListener("click",()=>{setColor(pixel);});document.querySelector(".grid").appendChild(pixel);}}
socket.onmessage=(event)=>{let data=JSON.parse(event.data);let x=data.index%16;let y=Math.floor(data.index/16);let physicalIndex=getPhysicalIndex(x,y);document.querySelectorAll(".pixel")[physicalIndex].style.backgroundColor=data.color;};document.getElementById("colorPicker").addEventListener("change",(event)=>{selectedColor=event.target.value;});</script>
</div>
<button class=clean-button onclick=cleanAll()>Clean All</button>
<div class=preset-effects>
<h2>Preset Effects</h2>
<button onclick="sendPresetEffect('rainbow')">Rainbow</button>
<button onclick="sendPresetEffect('sparkles')">Sparkles</button>
<button onclick="sendPresetEffect('bouncingball')">Bouncing Ball</button>
</div>
</body>
</html>
)rawliteral";

ICACHE_FLASH_ATTR void rainbow() {
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

ICACHE_FLASH_ATTR void sparkles() {
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

ICACHE_FLASH_ATTR int xyToIndex(int x, int y) {
  int index = 0;
  if (y % 2 == 0) {
    index = (16 * (16 - y)) + (16 - x);
  } else {
    index = (16 * (16 - y)) + (x - 1);
  }
  return index;
}

void bouncingBall() {
  static uint8_t hue = 0;
  static int x, y;
  static int dx, dy; // Direction of movement
  static CRGB ballColor = CRGB::White;

  // Initialize random starting position and direction
  if (x == 0 && y == 0) {
    x = random(4, 13);
    y = random(6, 10);
    dx += 1;
    dy += 1;
  }

  // Check if the ball is out of bounds and reset if necessary
  if (x <= 1 || x >= 15 || y <= 1 || y >= 16) {
    
    x = 8;
    y = 8;
    dx += 1;
    dy += 1;
    ballColor = CRGB(random(255), random(255), random(255));
  }

  fill_solid(leds, NUM_LEDS, CRGB::Black);

  // Draw the boundaries
  // Right Border
  for (int i = 0; i < 16; i++) {
    leds[i] = CRGB::White;
  }
  // Left border
  for (int i = 240; i < 256; i++) {
    leds[i] = CRGB::White;
  }
  // Top border
  int topBorderIndices[] = {240, 239, 208, 207, 176, 175, 144, 143, 112, 111, 80, 79, 48, 47, 16, 15};
  for (int i = 0; i < 16; i++) {
    leds[topBorderIndices[i]] = CRGB::White;
  }
  // Bottom border
  int bottomBorderIndices[] = {255, 224, 223, 192, 191, 160, 159, 128, 127, 96, 95, 64, 63, 32, 31, 0};
  for (int i = 0; i < 16; i++) {
    leds[bottomBorderIndices[i]] = CRGB::White;
  }
  // Draw the ball
  int ballIndex = xyToIndex(x, y);
  leds[ballIndex] = ballColor;

  x += dx;
  y += dy;

  if (x <= 2 || x >= 15) {
    dx = -dx;
    dy = random(0, 3) - 1;
    ballColor = CRGB(random(255), random(255), random(255));
  }

  // Check for collisions with the top/bottom borders
  if (y <= 2 || y >= 15) {
    dx = random(0, 3) - 1;
    dy = -dy;
    ballColor = CRGB(random(255), random(255), random(255));
  }

  FastLED.show();
  delay(25);
}

ICACHE_FLASH_ATTR void clean() {
  currentEffect = NONE;
  FastLED.clear();
  FastLED.show();
}

void setEffect(String effect) {
  clean();
  if (effect == "rainbow") currentEffect = RAINBOW;
  else if (effect == "sparkles") currentEffect = SPARKLES;
  else if (effect == "bouncingball") currentEffect = BOUNCING_BALL;
  else if (effect == "clean") currentEffect = NONE;
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
    
    FastLED.show();

    String effect = doc["effect"];
    if (effect != "null") {
      setEffect(effect);
    }
  }
}

void setup() {
  IPAddress ip;

  Serial.begin(115200);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  Serial.println("Connected to WiFi");
  Serial.flush();

  ip = WiFi.localIP();
  Serial.print("Local IP: ");
  Serial.println(ip);
  Serial.flush();

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
  if (currentEffect == RAINBOW) {
    rainbow();
  } else if (currentEffect == SPARKLES) {
    sparkles();
  } else if (currentEffect == BOUNCING_BALL) {
    bouncingBall();
  }
}
