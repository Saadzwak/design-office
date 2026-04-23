import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";

import App from "./App";
import Brief from "./routes/Brief";
import Chat from "./routes/Chat";
import Export from "./routes/Export";
import Justify from "./routes/Justify";
import Landing from "./routes/Landing";
import MoodBoard from "./routes/MoodBoard";
import ProjectDashboard from "./routes/ProjectDashboard";
import TestFit from "./routes/TestFit";
import "./styles/globals.css";

const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { path: "/", element: <Landing /> },
      { path: "/project", element: <ProjectDashboard /> },
      { path: "/brief", element: <Brief /> },
      { path: "/testfit", element: <TestFit /> },
      { path: "/moodboard", element: <MoodBoard /> },
      { path: "/justify", element: <Justify /> },
      { path: "/export", element: <Export /> },
      { path: "/chat", element: <Chat /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
