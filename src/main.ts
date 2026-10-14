import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import { loadClaudeFonts } from "./lib/bridge";

loadClaudeFonts();

mount(App, { target: document.getElementById("app")! });
