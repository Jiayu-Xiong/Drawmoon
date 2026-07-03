import { Route, Router } from "@solidjs/router"
import { render } from "solid-js/web"

import { AppLayout } from "./AppLayout"
import { refreshCopilotLlmBind } from "./data/llm-api-bind/bootstrap"
import ConsoleApp from "./pages/ConsoleApp"

const root = document.getElementById("root")
if (!root) throw new Error("No #root")

void refreshCopilotLlmBind()

render(
  () => (
    <Router root={AppLayout}>
      <Route path="/" component={ConsoleApp} />
      <Route path="/designer" component={ConsoleApp} />
      <Route path="/runs/:id" component={ConsoleApp} />
      <Route path="/profile" component={ConsoleApp} />
      <Route path="/*all" component={ConsoleApp} />
    </Router>
  ),
  root,
)
