import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/home";
import FlowDiagrams from "@/pages/flow-diagrams";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "./components/ui/sonner";
import Ahome from "./pages/a-home";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/flows" component={FlowDiagrams} />
      <Route component={Ahome} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
