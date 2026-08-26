import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n";
import "./styles.css";

// Notă: StrictMode este dezactivat intenționat — remontarea dublă a efectelor
// în dev ar duce la evenimente socket duplicate (matchmaking:findMatch etc.),
// care au efecte reale pe server, nu doar re-render-uri inofensive.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
