import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Home } from "./pages/Home";
import { PlayOnline } from "./pages/PlayOnline";
import { GameRoom } from "./pages/GameRoom";

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ padding: 24, fontFamily: "sans-serif" }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/play/online" element={<PlayOnline />} />
          <Route path="/game/:id" element={<GameRoom />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
