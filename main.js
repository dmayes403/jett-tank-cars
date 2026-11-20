const homeEl = document.getElementById("home");
let started = false;

function startGame() {
  if (started) return;
  started = true;
  homeEl.style.display = "none";
  // Prime the audio context inside the user gesture (some browsers require this).
  if (typeof getAudio === "function") getAudio();
  // Restart the round fresh so the "YOU ARE THE ___" splash shows for its
  // full duration — otherwise it counts down while the user is still on
  // the home page and often gets skipped.
  if (typeof resetGame === "function") resetGame();
  if (typeof startMusic === "function") startMusic();
}

homeEl.addEventListener("click", startGame);
homeEl.addEventListener("pointerdown", startGame);
homeEl.addEventListener("touchstart", startGame);
window.addEventListener("keydown", (e) => {
  if (!started && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    startGame();
  }
});
