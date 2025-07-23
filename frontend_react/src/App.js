import React, { useState, useEffect, useRef } from "react";
import "./App.css";

/*
  Color Theme:
    --primary:   #1976D2;
    --secondary: #424242;
    --accent:    #FF4081;
*/

// Util: Determine winner and valid moves
function calculateWinner(squares) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8], // rows
    [0,3,6],[1,4,7],[2,5,8], // cols
    [0,4,8],[2,4,6],         // diags
  ];
  for (const [a, b, c] of lines) {
    if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c])
      return squares[a];
  }
  if (squares.every(cell => cell)) return "draw";
  return null;
}

// PUBLIC_INTERFACE
function App() {
  // STATE
  const [theme, setTheme] = useState("light");
  const [board, setBoard] = useState(Array(9).fill(null));
  const [isXTurn, setIsXTurn] = useState(true); // X is always the user
  const [gameStatus, setGameStatus] = useState("playing"); // playing|won|draw
  const [aiThinking, setAiThinking] = useState(false);
  const [chatLog, setChatLog] = useState([
    {sender: "ai", msg: "Ready to be schooled in Tic Tac Toe? Let's play!"},
  ]);
  const [openaiError, setOpenaiError] = useState(null);

  const chatBottomRef = useRef(null);

  // THEME HANDLING
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  // Chat scroll to bottom
  useEffect(() => {
    if (chatBottomRef.current) chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [chatLog]);
  
  // GAMEPLAY -- after User move, AI plays with delay
  useEffect(() => {
    const winner = calculateWinner(board);
    if (winner) {
      setGameStatus(winner === "draw" ? "draw" : "won");
      if (winner === "draw") triggerAITaunt("It's a draw! Not bad, but not good enough to beat me.", board, true);
      else if (winner === "X")
        triggerAITaunt("Impossible! Did you cheat? Ugh. Well played, human.", board, true);
      else
        triggerAITaunt("Another win for the AI mastermind. Try again?", board, true);
      return;
    }
    if (!isXTurn && !winner && gameStatus === "playing") {
      setAiThinking(true);
      const aiMoveTimeout = setTimeout(() => {
        const move = bestAIMove(board);
        if (move !== null) handleCellClick(move, true);
      }, 720 + Math.random() * 600); // Simulate "thinking"
      return () => clearTimeout(aiMoveTimeout);
    }
  // eslint-disable-next-line
  }, [board, isXTurn, gameStatus]);

  // --- HANDLERS ---
  function handleCellClick(idx, ai = false) {
    if (aiThinking && !ai) return;
    if (gameStatus !== "playing") return;
    if (board[idx]) return;
    if (!ai && !isXTurn) return; // Human can't play when not their turn

    const squares = board.slice();
    squares[idx] = isXTurn ? "X" : "O";
    setBoard(squares);
    setIsXTurn(!isXTurn);

    // Add chat: announce move
    if (ai) {
      setAiThinking(false);
    }
    if (!ai) {
      triggerAITaunt(null, squares, false, idx);
    }
  }

  // AI LOGIC (Minimax) - not perfect, but challenging.
  function bestAIMove(squares) {
    // First, check for winning move or block user's win
    for (let i=0;i<9;i++) {
      if (!squares[i]) {
        // Try win
        let test = squares.slice(); test[i] = "O";
        if (calculateWinner(test) === "O") return i;
        // Prevent user win
        test = squares.slice(); test[i] = "X";
        if (calculateWinner(test) === "X") return i;
      }
    }
    // Otherwise, take center, then corners, then sides
    if (!squares[4]) return 4;
    const order = [0,2,6,8,1,3,5,7];
    for (const i of order) if (!squares[i]) return i;
    return null;
  }

  // PUBLIC_INTERFACE
  async function triggerAITaunt(prePrompt, squares, gameDone, moveIdx) {
    if (prePrompt) {
      addChat("ai", prePrompt, true);
      return;
    }
    // Get history for better context
    const lastMoves = getLastMoveList(board, squares, isXTurn ? "O" : "X");
    const userTxt = moveIdx !== undefined 
      ? board.map((v, i) => i === moveIdx ? "[X]" : v === "O" ? "O" : v === "X" ? "X" : ".").join("")
      : null;
    addChat("user", "My move!", false);
    // Compose trash talk prompt
    const prompt = `
You're an arrogant, witty, trash-talking AI playing Tic Tac Toe (your symbol: O) against a human (X).
Comment on their recent move or the board, roast them playfully, gloat if winning, talk smack if drawing, and taunt especially when they mess up.
Board: ${formatBoardForLLM(squares)}
Previous moves: ${lastMoves}
User’s move: ${userTxt}
Rules: Be clever, concise, and always in-character. 2-3 sentences max. Don't repeat yourself.
Ready? Respond with your best trash talk NOW.
    `.trim();
    addChat("ai", "...");
    try {
      const result = await fetchOpenAIResponse(prompt);
      setOpenaiError(result.error ? result.error : null);
      updateLastAiChat(result.error ? "AI error: Could not get a roast." : result.content);
    } catch (err) {
      setOpenaiError("OpenAI API request failed.");
      updateLastAiChat("You got off easy this turn – OpenAI dropped the ball.");
    }
  }

  // -- OpenAI API call for trash talk
  async function fetchOpenAIResponse(prompt) {
    // PUBLIC_INTERFACE
    // Returns { content: string, error?: string }
    const apiKey = process.env.REACT_APP_OPENAI_API_KEY;
    if (!apiKey) 
      return { error: "Missing OpenAI API key in .env (REACT_APP_OPENAI_API_KEY)" };
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + apiKey,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [{
            role: "system",
            content: "You're a trash-talking, gloating AI Tic Tac Toe opponent. Never break character."
          }, {
            role: "user",
            content: prompt,
          }],
          max_tokens: 60,
          temperature: 0.95,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json();
        return { error: errJson.error?.message || "OpenAI API failure."};
      }
      const data = await res.json();
      const msg = data.choices?.[0]?.message?.content?.trim() || "No response.";
      return { content: msg };
    } catch (e) {
      return { error: "OpenAI request failed (network or CORS?)"};
    }
  }

  // CHAT MANAGEMENT
  function addChat(sender, msg, finishPrev = false) {
    setChatLog((prev) => {
      if(finishPrev && prev[prev.length-1]?.msg === "...") {
        prev = prev.slice(0, -1);
      }
      return [...prev, {sender, msg}];
    });
  }
  function updateLastAiChat(newMsg) {
    setChatLog((prev) => {
      let out = prev.slice();
      for (let i = out.length-1; i >= 0; i--) {
        if (out[i].sender === "ai" && out[i].msg === "...") {
          out[i] = {sender:"ai",msg: newMsg};
          break;
        }
      }
      return out;
    });
  }
  function resetGame() {
    setBoard(Array(9).fill(null));
    setIsXTurn(true);
    setGameStatus("playing");
    setAiThinking(false);
    setChatLog([{sender:'ai',msg:'Ready to be schooled in Tic Tac Toe? Let\'s play!'}]);
    setOpenaiError(null);
  }

  // Presentation helpers
  function boardStatusLabel() {
    const winner = calculateWinner(board);
    if (winner && winner !== "draw") return winner === "X" ? "You win! 🎉" : "AI wins! 🤖";
    if (winner === "draw") return "It's a draw!";
    if (aiThinking) return "AI is thinking...";
    if (isXTurn) return "Your turn (X)";
    return "AI's turn (O)";
  }

  // RENDER -----------------------------------------
  return (
    <div className="App">
      {/* Header */}
      <header className="main-header" style={{
        width: "100%",
        padding: "0.5em 0 0.3em 0",
        background: "var(--bg-secondary)",
        borderBottom: "2px solid #e9ecef",
        display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <h1 style={{
            margin: 0, padding: "0 1rem", fontSize: "2.1rem", fontWeight: 700,
            color: "#1976D2", fontFamily: "Segoe UI,Arial,sans-serif", letterSpacing: '0.01em'
          }}>
          Tic Tac Toe Trash Talk
        </h1>
        <div style={{display:"flex", alignItems:"center", gap: "0.4em", paddingRight:"1.2em"}}>
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === "light" ? "🌙 Dark" : "☀️ Light"}
          </button>
          <button className="reset-btn" style={{
            background: "#FF4081", color: "#fff", padding: "9px 19px", borderRadius: "8px", fontWeight: 700,
            marginLeft: "0.2em", border: "none", fontSize: "1em", cursor: "pointer", boxShadow: "0 2px 7px #ee9dc944"
          }} onClick={resetGame}>
            Restart
          </button>
        </div>
      </header>
      {/* Board */}
      <main className="game-main" style={{
        display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minHeight: "590px"
      }}>
        <div style={{
          margin: "2em 0 1.1em 0",
          padding: 0, fontWeight: 600, fontSize: "1.28em", color: "#424242"
        }}>{boardStatusLabel()}</div>
        <Board board={board} onCellClick={handleCellClick} disabled={aiThinking || gameStatus !== "playing"} />
        {/* Chat Window */}
        <section className="chat-section" style={{
          width: "100%", maxWidth: 530,
          margin: "1.8em auto 0 auto", background: "#fafbff",
          borderRadius: "13px", boxShadow: "0 2px 18px #1976d24a, 0 0px 2px #0002",
          padding: "1.2em 1.1em 0.6em 1.1em", minHeight: "150px"
        }}>
          <h2 style={{
            fontSize: "1.2em", color: "#1976D2", marginTop:0, marginBottom:"0.15em", textAlign: "left"
          }}>Trash Talk Chat</h2>
          <div className="chat-log" style={{
            maxHeight: 160, overflowY: "auto", marginBottom: "0.8em", fontSize: "1em"
          }}>
            {chatLog.map((item, i) =>
              <ChatMessage key={i} sender={item.sender} msg={item.msg} />
            )}
            <div ref={chatBottomRef} />
          </div>
          {openaiError && <div style={{color:"#FF4081", marginBottom: "0.5em"}}>AI Chat error: {openaiError}</div>}
        </section>
      </main>
      {/* Credits */}
      <footer style={{
        borderTop: "1px solid #e9ecef", fontSize: "0.96em", color: "#888", marginTop: 32, padding: "1em 0 0.7em 0"
      }}>
        Built with <span style={{color:"#1976D2"}}>React</span> + <span style={{color:"#FF4081"}}>OpenAI</span> | <span style={{color:"#424242"}}>Kavia.ai</span>
      </footer>
    </div>
  );
}

// PUBLIC_INTERFACE
function Board({ board, onCellClick, disabled }) {
  return (
    <div className="ttt-board" style={{
      width: 315, height: 315,
      display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "repeat(3,1fr)",
      gap: 0, background: "#fff",
      borderRadius: "18px", boxShadow: "0 4px 32px #1976D222, 0 2px 9px #ff408122"
    }}>
      {board.map((cell, idx) => (
        <button
          key={idx}
          className="ttt-cell"
          style={cellBtnStyle(cell)}
          aria-label={`cell ${idx+1}:${cell ? cell : "empty"}`}
          onClick={() => onCellClick(idx)}
          disabled={disabled || !!cell}
        >
          {cell && <span style={{
            fontWeight: "bold",
            color: cell === "X" ? "#1976D2" : "#FF4081",
            textShadow: cell === "X"
              ? "0 2px 4px #05487e24"
              : "0 2px 4px #7a184624",
            fontSize: 54, letterSpacing: "2px"
          }}>{cell}</span>}
        </button>
      ))}
    </div>
  );
}

function cellBtnStyle(cellVal) {
  return {
    border: "2px solid #e9ecef",
    background: "#fff",
    fontSize: "1.2em",
    height: 105, width: 105,
    outline: "none",
    cursor: cellVal ? "not-allowed" : "pointer",
    boxShadow: cellVal ? "none" : "0 1px 8px #1976d226",
    transition: "background 0.13s, box-shadow 0.18s",
    borderRadius: "11px",
    margin: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none"
  };
}


// PUBLIC_INTERFACE
function ChatMessage({sender, msg}) {
  const you = sender === "user";
  return (
    <div
      style={{
        textAlign: you ? "right" : "left",
        margin: "0.2em 0",
        background: you ? "#1976D213" : "#ff40811a",
        padding: "5px 11px",
        borderRadius: you ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
        color: you ? "#1976D2" : "#FF4081",
        fontWeight: 500,
        display: "inline-block",
        maxWidth: "95%",
        fontFamily: "Segoe UI, Arial, sans-serif"
      }}
    >{msg}</div>
  );
}

// --- Helpers
function formatBoardForLLM(b) {
  // X O . . etc as a 1D array
  return "\n" + [0,3,6].map(i=>b.slice(i,i+3).map(e=>e||".").join(" ")).join("\n");
}
function getLastMoveList(prev, newb, player) {
  // Show which move was just made (index).
  let idx = -1;
  for (let i=0;i<9;i++) if (prev[i] !== newb[i]) idx=i;
  if (idx===-1) return "(no move found)";
  return `Player ${player} to (${Math.floor(idx/3)+1},${(idx%3)+1})`;
}

export default App;
