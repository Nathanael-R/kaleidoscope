import ErrorBoundary from "./components/error-boundary";
import Workspace from "./pages/workspace";

function App() {
  return (
    <ErrorBoundary>
      <Workspace />
    </ErrorBoundary>
  );
}

export default App;
