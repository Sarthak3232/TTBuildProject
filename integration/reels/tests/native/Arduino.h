#pragma once
// Minimal UART/clock double for testing the actual motion_link.h on a PC.
#include <stdint.h>
#include <stdlib.h>
#include <string>
#include <functional>
#include <deque>
#include <utility>

#define HIGH 1
#define LOW 0
#define OUTPUT 1
#define SERIAL_8N1 0

class String {
 public:
  std::string value;
  String() = default;
  String(const char* s): value(s) {}
  String(std::string s): value(std::move(s)) {}
  String(int n): value(std::to_string(n)) {}
  String(unsigned n): value(std::to_string(n)) {}
  unsigned length() const { return unsigned(value.size()); }
  int indexOf(char c) const {
    auto p = value.find(c);
    return p == std::string::npos ? -1 : int(p);
  }
  int lastIndexOf(char c) const {
    auto p = value.rfind(c);
    return p == std::string::npos ? -1 : int(p);
  }
  String substring(unsigned a) const { return value.substr(a); }
  String substring(unsigned a, unsigned b) const { return value.substr(a, b-a); }
  int toInt() const { return atoi(value.c_str()); }
  char operator[](unsigned i) const { return value[i]; }
  String& operator+=(char c) { value += c; return *this; }
  void trim() {
    auto a = value.find_first_not_of(" \t\r\n");
    if (a == std::string::npos) { value.clear(); return; }
    auto b = value.find_last_not_of(" \t\r\n");
    value = value.substr(a, b-a+1);
  }
  friend String operator+(const String& a, const String& b) {
    return a.value + b.value;
  }
  friend bool operator==(const String& a, const String& b) {
    return a.value == b.value;
  }
};

uint32_t testMillis = 0;
inline uint32_t millis() { return testMillis; }
inline void delay(unsigned n) { testMillis += n; }
inline void pinMode(int, int) {}
inline void digitalWrite(int, int) {}

class HardwareSerial {
 public:
  std::deque<char> rx;
  std::function<void(const std::string&)> onTransmit;
  void begin(int, int=0, int=0, int=0) {}
  int available() { return int(rx.size()); }
  int read() { char c=rx.front(); rx.pop_front(); return c; }
  void inject(const std::string& s) {
    for(char c:s) rx.push_back(c);
  }
  void println(const String& s) {
    if(onTransmit) onTransmit(s.value);
  }
};
HardwareSerial Serial;
HardwareSerial Serial2;
