import { reactLogo, viteLogo } from './assets'
import './App.css'
import { trpc } from './trcp'

function App() {
  const utils = trpc.useContext()
  const counter = trpc.getCounter.useQuery()
  const incrementCounter = trpc.incrementCounter.useMutation()
  trpc.onIncrementCounter.useSubscription(undefined, {
    onData: (data) => {
      utils.getCounter.setData(undefined, data)
    },
  })

  return (
    <div className="App">
      <div>
        <a href="https://vitejs.dev" target="_blank" rel="noreferrer">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://reactjs.org" target="_blank" rel="noreferrer">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button type="button" onClick={() => incrementCounter.mutate()}>
          count is {counter.data}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </div>
  )
}

export default App
