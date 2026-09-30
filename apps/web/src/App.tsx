import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { PlayOnline } from "./pages/PlayOnline";
import { PlayRobot } from "./pages/PlayRobot";
import { GameRoom } from "./pages/GameRoom";
import { Puzzle } from "./pages/Puzzle";
import { Rules } from "./pages/Rules";

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/play/online" element={<PlayOnline />} />
          <Route path="/play/robot" element={<PlayRobot />} />
          <Route path="/game/:id" element={<GameRoom />} />
          <Route path="/puzzle" element={<Puzzle />} />
          <Route path="/rules" element={<Rules />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
