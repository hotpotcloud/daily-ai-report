import { Routes, Route, Navigate } from "react-router-dom";
import HomePage from "./pages/HomePage.jsx";
import ArchivePage from "./pages/ArchivePage.jsx";
import TopicPage from "./pages/TopicPage.jsx";
import CategoryPage from "./pages/CategoryPage.jsx";
import MePage from "./pages/MePage.jsx";
import Topbar from "./components/Topbar.jsx";
import Chat from "./components/Chat.jsx";
import Footer from "./components/Footer.jsx";

export default function App() {
  return (
    <div className="app">
      <Topbar />
      <main id="main" className="page">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/archive" element={<ArchivePage />} />
          <Route path="/topic/:slug" element={<TopicPage />} />
          <Route path="/category/:slug" element={<CategoryPage />} />
          <Route path="/me" element={<MePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
      <Chat />
    </div>
  );
}
