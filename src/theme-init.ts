// Pico otomatis mengikuti prefers-color-scheme. POS selalu mode terang supaya
// struk putih tetap konsisten walaupun tablet disetel dark mode.
document.documentElement.dataset.theme = "light";

// Muat font Plus Jakarta Sans dari Google Fonts (untuk offline-first, font
// ini tetap diunduh browser saat pertama kali membuka, lalu di-cache).
const fontLink = document.createElement("link");
fontLink.rel = "preconnect";
fontLink.href = "https://fonts.googleapis.com";
document.head.appendChild(fontLink);

const fontLink2 = document.createElement("link");
fontLink2.rel = "stylesheet";
fontLink2.href =
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap";
document.head.appendChild(fontLink2);
