// Browser Speech-to-Text and Text-to-Speech helpers (Web Speech API)

export function speak(text, lang = "en-US") {
  if (!("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = lang.startsWith("en") ? 0.92 : 0.95;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

export function getRecognition(lang = "en-US") {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  return rec;
}

export const sttSupported = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
