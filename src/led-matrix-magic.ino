#include <FastLED.h>
#include <ArduinoJson.h>

#define DATA_PIN D4
#define NUM_LEDS 256
#define DEFAULT_BRIGHTNESS 50

CRGB leds[NUM_LEDS];
StaticJsonDocument < 4096 > lastDoc;

void setup() {
    Serial.begin(115200);
    while (!Serial) {
        ; // Wait for serial port to connect
    }
    // Clear any leftover serial data
    while (Serial.available() > 0) Serial.read();
    Serial.println("Wemos D1 Mini ready");

    FastLED.addLeds < WS2812B, DATA_PIN, GRB > (leds, NUM_LEDS);
    FastLED.setBrightness(DEFAULT_BRIGHTNESS);
    fill_solid(leds, NUM_LEDS, CRGB::Black);
    FastLED.show();

    // Retry requesting state until response
    bool stateLoaded = false;
    unsigned long startTime = millis();
    while (!stateLoaded && millis() - startTime < 10000) { // 10-second timeout
        StaticJsonDocument < 200 > doc;
        doc["command"] = "getState";
        serializeJson(doc, Serial);
        Serial.println();
        Serial.println("Requesting state from server...");
        delay(1000); // Increased delay for server response
        serialEvent(); // Process any incoming data
        if (lastDoc.containsKey("state")) { // Check global doc
            stateLoaded = true;
        }
    }
    if (!stateLoaded) {
        Serial.println("Failed to load state from server within timeout");
    }
}

void serialEvent() {
    if (Serial.available() > 0) {
        String message = Serial.readStringUntil('\n');
        Serial.println("Received: " + message);

        DeserializationError error = deserializeJson(lastDoc, message);

        if (!error) {
            if (lastDoc.containsKey("state")) {
                JsonArray state = lastDoc["state"];
                for (int i = 0; i < NUM_LEDS && i < state.size(); i++) {
                    String color = state[i];
                    long hexColor = strtol(color.c_str() + 1, NULL, 16);
                    leds[i] = CRGB(hexColor >> 16, (hexColor >> 8) & 0xFF, hexColor & 0xFF);
                }
                FastLED.show();
                Serial.println("Loaded full state from server");
            } else if (lastDoc.containsKey("updates")) {
                JsonArray updates = lastDoc["updates"];
                for (JsonObject update: updates) {
                    int index = update["index"];
                    String color = update["color"];
                    long hexColor = strtol(color.c_str() + 1, NULL, 16);
                    leds[index] = CRGB(hexColor >> 16, (hexColor >> 8) & 0xFF, hexColor & 0xFF);
                }
                FastLED.show();
                delay(20); // One show for batch with slight delay for stability
                Serial.println("Updated " + String(updates.size()) + " pixels");
            } else if (lastDoc.containsKey("index") && lastDoc.containsKey("color")) {
                int index = lastDoc["index"];
                String color = lastDoc["color"];
                long hexColor = strtol(color.c_str() + 1, NULL, 16);
                leds[index] = CRGB(hexColor >> 16, (hexColor >> 8) & 0xFF, hexColor & 0xFF);
                FastLED.show();
                delay(10); // Small delay for single pixel updates
                Serial.println("Updated pixel " + String(index));
            } else if (lastDoc.containsKey("effect") && lastDoc["effect"] == "clean") {
                clean();
                Serial.println("Cleaned");
            } else if (lastDoc.containsKey("command") && lastDoc["command"] == "getState") {
                sendLedState();
            }
        } else {
            Serial.println("JSON parse error: " + String(error.c_str()));
        }
    }
}

void loop() {
    serialEvent();
}

void clean() {
    fill_solid(leds, NUM_LEDS, CRGB::Black);
    FastLED.show();
}

void sendLedState() {
    StaticJsonDocument < 4096 > doc; // Larger buffer for full state
    JsonArray state = doc.createNestedArray("state");
    for (int i = 0; i < NUM_LEDS; i++) {
        char color[8];
        sprintf(color, "#%02X%02X%02X", leds[i].r, leds[i].g, leds[i].b);
        JsonObject pixel = state.createNestedObject();
        pixel["index"] = i;
        pixel["color"] = color;
    }
    serializeJson(doc, Serial);
    Serial.println();
    Serial.println("Sent LED state");
}