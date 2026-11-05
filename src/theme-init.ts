// POS selalu mode terang supaya warna struk & layar konsisten walaupun tablet
// disetel dark mode. Tidak ada font eksternal: sistem font dipakai agar app
// tetap ringan dan tampil benar saat offline (tanpa request ke Google Fonts).
document.documentElement.dataset.theme = "light";
document.documentElement.style.colorScheme = "light";
