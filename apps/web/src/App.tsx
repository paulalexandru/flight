import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { PlayOnline } from "./pages/PlayOnline";
import { GameRoom } from "./pages/GameRoom";

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/play/online" element={<PlayOnline />} />
          <Route path="/game/:id" element={<GameRoom />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
