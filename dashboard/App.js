import React, { useState, useEffect } from "react";

function App() {
  const today = new Date().toISOString().split("T")[0];

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDate, setFilterDate] = useState(today);
  const [selectedTicket, setSelectedTicket] = useState(null);

  useEffect(() => {
    fetch("http://10.15.13.219:3000/listTickets")
      .then((res) => res.json())
      .then((data) => {
        const results = data.tickets || [];
        results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Sort descending by createdAt
        setTickets(results || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("API Error:", err);
        setLoading(false);
      });
  }, []);

  const handleChangeStatus = (ticketId, newStatus) => {
    if (!newStatus) return;

    fetch("http://10.15.13.219:3000/updateTicket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId,
        status: newStatus, // send status directly
      }),
    })
      .then((res) => res.json())
      .then(() => {
        // ✅ Update UI without alert
        setTickets((prev) =>
          prev.map((t) =>
            t.ticketId === ticketId ? { ...t, status: newStatus } : t
          )
        );
      })
      .catch((err) => {
        console.error("Status update failed:", err);
      });
  };

  const filteredTickets = tickets.filter((t) => {
    const searchLower = search.toLowerCase();
    const matchesSearch =
      t.ticketId.toString().includes(searchLower) ||
      (t.summary && t.summary.toLowerCase().includes(searchLower)) ||
      (t.storeId && t.storeId.toLowerCase().includes(searchLower));

    const fileDate = t.createdAt ? t.createdAt.slice(0, 10) : "";
    const matchesDate = filterDate ? fileDate === filterDate : true;

    return matchesSearch && matchesDate;
  });

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <header
        style={{ display: "flex", alignItems: "center", marginBottom: "20px" }}
      >
        <div>
          <h1 style={{ color: "#E35D5B", margin: 0 }}>FOODHUB</h1>
          <small
            style={{ color: "#555", display: "block", textAlign: "center" }}
          >
            Bug Tracker
          </small>
        </div>

        <input
          type="text"
          placeholder="Search by Ticket ID, summary, or Store ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            margin: "0 20px",
            padding: "8px",
            borderRadius: "5px",
            border: "1px solid #ccc",
          }}
        />

        <div style={{ display: "flex", alignItems: "center" }}>
          <label style={{ marginRight: "8px" }}>Filter by Date</label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value || today)}
            style={{
              padding: "5px",
              borderRadius: "5px",
              border: "1px solid #ccc",
            }}
          />
        </div>
      </header>

      {/* Table */}
      <div
        style={{
          border: "1px solid #eee",
          borderRadius: "5px",
          overflow: "hidden",
        }}
      >
        {/* Table Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "0.7fr 1fr 1.5fr 2fr 1.5fr 1fr 1fr",
            background: "#E35D5B",
            color: "#fff",
            fontWeight: "bold",
            padding: "10px",
            textAlign: "left",
          }}
        >
          <div>S.No</div>
          <div>TICKET</div>
          <div>STORE</div>
          <div>SUMMARY</div>
          <div>RAISED AT</div>
        </div>

        {loading ? (
          <div
            style={{
              padding: "20px",
              textAlign: "center",
              color: "#777",
            }}
          >
            Loading...
          </div>
        ) : filteredTickets.length > 0 ? (
          filteredTickets.map((t, index) => (
            <div
              key={t.ticketId}
              style={{
                display: "grid",
                gridTemplateColumns: "0.7fr 1fr 1.5fr 2fr 1.5fr 1fr 1fr",
                padding: "12px",
                borderBottom: "1px solid #eee",
                alignItems: "center",
              }}
            >
              <div>{index + 1}</div>
              <div>{t.ticketId}</div>
              <div>{t.storeId || "-"}</div>
              <div>{t.summary}</div>
              <div>{t.createdAt}</div>

              {/* View Button */}
              <div style={{ textAlign: "center" }}>
                <button
                  style={{
                    padding: "6px 10px",
                    borderRadius: "4px",
                    border: "none",
                    background: "#E35D5B",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                  onClick={() => setSelectedTicket(t)}
                >
                  View
                </button>
              </div>

              {/* Status Dropdown */}
              <div>
                <select
                  value={t.status || ""}
                  onChange={(e) =>
                    handleChangeStatus(t.ticketId, e.target.value)
                  }
                  style={{
                    padding: "5px",
                    borderRadius: "4px",
                    border: "1px solid #ccc",
                  }}
                >
                  <option value="">Change Status</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Not Doing">Not Doing</option>
                </select>
              </div>
            </div>
          ))
        ) : (
          <div
            style={{
              padding: "20px",
              textAlign: "center",
              color: "#777",
            }}
          >
            No records found
          </div>
        )}
      </div>

      {/* Modal */}
      {selectedTicket && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setSelectedTicket(null)}
        >
          <div
            style={{
              background: "#fff",
              padding: "24px",
              borderRadius: "16px",
              width: "700px",
              maxHeight: "85%",
              overflowY: "auto",
              position: "relative",
              boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
              animation: "fadeIn 0.3s ease-in-out",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header + Close Row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  flex: 1,
                  borderRadius: "12px",
                  padding: "16px",
                  textAlign: "left",
                  marginRight: "12px",
                }}
              >
                <h4
                  style={{ margin: 0, color: "#000" }}
                  dangerouslySetInnerHTML={{ __html: selectedTicket.summary }}
                ></h4>
              </div>
              <div
                style={{
                  borderRadius: "50%",
                  background: "#fafafa",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                }}
              >
                <button
                  onClick={() => setSelectedTicket(null)}
                  style={{
                    border: "none",
                    backgroundColor: "#f1f1f1",
                    borderRadius: "50%",
                    width: "32px",
                    height: "32px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "background 0.2s ease",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "#e0e0e0")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "#f1f1f1")
                  }
                >
                  <span
                    style={{ fontSize: "18px", color: "#000", lineHeight: "1" }}
                  >
                    ×
                  </span>
                </button>
              </div>
            </div>

            {/* Description */}
            <div
              style={{
                background: "#fafafa",
                border: "1px solid #eee",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "16px",
                boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
              }}
            >
              <h4 style={{ margin: "8px 0", color: "#E35D5B" }}>
                Description
              </h4>
              <div
                style={{ color: "#555", lineHeight: "1.5" }}
                dangerouslySetInnerHTML={{
                  __html:
                    selectedTicket.description ||
                    "<i>No description provided.</i>",
                }}
              />
            </div>

            {/* Ticket Details */}
            <div
              style={{
                background: "#fafafa",
                border: "1px solid #eee",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "16px",
                boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
              }}
            >
              <h4 style={{ margin: "8px 0", color: "#E35D5B" }}>
                Ticket Details
              </h4>
              {/* <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "8px",
                }}
              >
                <p>
                  <strong>ID:</strong> {selectedTicket.ticketId}
                </p>
                <p>
                  <strong>Store:</strong> {selectedTicket.storeId || "-"}
                </p>
                <p>
                  <strong>Summary:</strong> {selectedTicket.summary}
                </p>
                <p>
                  <strong>Created:</strong> {selectedTicket.createdAt}
                </p>
                <p>
                  <strong>Version:</strong>{" "}
                  {selectedTicket.deviceInfo?.version || "-"}
                </p>
              </div> */}
             <div
  style={{
    display: "flex",
    flexDirection: "column", // stack vertically
    gap: "6px",              // spacing between lines
    fontSize: "14px",
    color: "#333",
  }}
>
  <p style={{ margin: 0 }}>
    <strong>ID:</strong> {selectedTicket.ticketId}
  </p>
  <p style={{ margin: 0 }}>
    <strong>Store:</strong> {selectedTicket.storeId || "-"}
  </p>
  <p style={{ margin: 0 }}>
    <strong>Summary:</strong> {selectedTicket.summary}
  </p>
  <p style={{ margin: 0 }}>
    <strong>Created:</strong> {selectedTicket.createdAt}
  </p>
  <p style={{ margin: 0 }}>
    <strong>Version:</strong> {selectedTicket.deviceInfo?.version || "-"}
  </p>
</div>


            </div>

            {/* Attachments */}
            <div
              style={{
                background: "#fafafa",
                border: "1px solid #eee",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "16px",
                boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
              }}
            >
              <h4 style={{ margin: "8px 0", color: "#E35D5B" }}>
                Attachments
              </h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px",
                }}
              >
                {/* Video */}
                <div
                  style={{
                    border: "1px solid #eee",
                    borderRadius: "12px",
                    padding: "12px",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                    background: "#fff",
                  }}
                >
                  <video
                    style={{ width: "100%", borderRadius: "8px" }}
                    controls
                    muted
                  >
                    <source src={selectedTicket.videoLink} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                  <p style={{ fontSize: "13px", margin: "8px 0 2px" }}>
                    Reference Video
                  </p>
                  <p style={{ fontSize: "11px", color: "#777" }}>
                    {selectedTicket.createdAt}
                  </p>
                </div>

                {/* Audio */}
                {/* <div
                  style={{
                    border: "1px solid #eee",
                    borderRadius: "12px",
                    padding: "12px",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                    background: "#fff",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                  }}
                >
                  <p style={{ fontSize: "13px", margin: "8px 0" ,textAlign:"center"}}>
                    Voice Recording
                  </p>
                  {selectedTicket.audioLink ? (
                    <audio controls style={{ width: "100%" }}>
                      <source
                        src={selectedTicket.audioLink}
                        type="audio/mpeg"
                      />
                      Your browser does not support audio playback.
                    </audio>
                  ) : (
                    <p style={{ color: "#777", fontSize: "12px" }}>
                      No audio available
                    </p>
                  )}
                </div> */}
 
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

