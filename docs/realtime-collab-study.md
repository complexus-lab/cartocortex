# Real-time co-editing transport — study

**Status:** study only — specified, never executed. **Date:** 2026-10-29. **Related:** backlog item 1 (CRDT-backed document model), item 2 (browser deployment), item 3 (cloud drive synchronization).

## Intent

Several people edit the same map at the same time, typically during a meeting or a video call. Participants may be on the desktop app or in the browser. The question this study answers: how do the edits travel — what identifier participants share, how connections cross firewalls and NATs, and how much of it can run without a central point of failure. Local-first throughout: the document lives on each participant's device; the network only carries the updates.

## What travels: CRDT deltas, not the document

The CRDT sync protocols are transport-agnostic, so the transport choice does not constrain the library choice of backlog item 1:

- **Yjs** peers exchange a compact state vector (what each side has seen), then only the missing updates; the wire protocol is binary, and persistence is just another consumer of the same update stream (`y-indexeddb` proves the pattern in the browser).
- **Automerge's** sync protocol explicitly runs on "any connection-based network link that supports bidirectional messages — WebSocket, WebRTC, or plain TCP", in any topology: client-server, peer-to-peer, or server-to-server.
- **Loro** exports updates by version vector and streams local updates through `subscribeLocalUpdates`; its wire protocol even multiplexes several rooms over one connection.

The same encodings can later run over a cloud bucket (item 3) for asynchronous collaboration — one protocol, several transports.

## The identifier: a room ID in a link

Participants share one identifier: a random room ID. The natural carrier is a link, pasted into whatever channel the meeting already uses — the visio chat, a message, a QR code on the projector. Two details matter:

- Put the room ID in the **URL fragment** (after `#`): fragments are never sent to servers, so the discovery infrastructure does not learn which room you join.
- A room ID is public information by nature; an optional shared **password** is the door key — in `y-webrtc` it encrypts all peer-to-peer communication. CRDTs merge whatever arrives, so the room password is the access control: anyone holding it can write to the document.

## Transport: WebRTC data channels, peer to peer

Once two peers know of each other, they establish an encrypted WebRTC data channel and exchange CRDT deltas directly — the document never passes through a server. Each peer caps its mesh connections (y-webrtc: about 20–35, with a random factor that prevents cluster formation); that is comfortable for a meeting-sized session — the provider's design case was a conference of about 100 clients on a bad network. Hub-and-spoke relays scale to thousands of editors but reintroduce a central authority; the mesh is the right shape for sessions, the bucket of item 3 the right shape for asynchronous work.

## Discovery: signaling, the honest part

Peers must first find each other and exchange connection metadata (SDP offers/answers, ICE candidates). On today's web this needs a broker, and the study is honest about it:

- A **signaling server** is a lightweight publish/subscribe keyed by room name. It carries only connection metadata, only during setup — never document data.
- Clients can connect to **several signaling servers concurrently** (a public list plus your own); the servers are interchangeable, the implementation is a few dozen lines of WebSocket code, self-hostable, and serverless deployments of it exist. No single point of failure: if one is down, the others still introduce the peers.
- Alternatives: WebTorrent-style trackers play the same role. For the **desktop app**, true serverless discovery exists — Hyperswarm's DHT joins by a shared 32-byte topic with no broker at all, and a meeting-room session on one LAN can use local discovery with no internet. Browsers cannot join UDP DHTs, so the browser build keeps a signaling step.

## Firewalls and NAT: ICE, STUN, TURN

ICE gathers every possible path: local addresses (host), the public address discovered via STUN (server-reflexive), and a relay address via TURN. The practical facts to plan around:

- Most home and office cone NATs connect directly after STUN — free and stateless.
- **Symmetric NAT** — common on mobile carrier-grade NAT and enterprise firewalls — defeats STUN: the port the STUN server saw is not the port a peer sees, and TURN is the only reliable way through.
- Plan for roughly **10–20% of sessions needing the TURN relay** (higher on enterprise networks), and for networks that block UDP entirely: the relay must also listen as TURN over TLS on port 443 (`turns:`).
- TURN adds latency and bandwidth cost, and must always be configured: shipping STUN-only silently fails for exactly the networks meetings happen on — corporate offices, university Wi-Fi, mobile data.
- A TURN relay is a **fallback**, used only when the direct path fails. It carries only ciphertext — data channels are DTLS-encrypted end to end — and it is self-hostable (coturn, open source): any participant's machine can run one for the group.

## What a session looks like

1. One participant opens the map and creates a session: the app generates a room ID and key, and shows a link (`https://…/#room-id`).
2. The link is pasted into the visio chat; everyone clicks; the app joins the room through the configured signaling servers.
3. Peers connect peer-to-peer; CRDT deltas flow directly; presence (who is where) rides the awareness channel — ephemeral state, rebroadcast about every 15 seconds, dropped after 30.
4. Someone drops offline: the rest continue; on return, the sync protocol exchanges only what was missed.
5. At the end everyone keeps a full local copy — the session was a transport, not a home.

## Avoiding central points of failure — what is possible today

A fully serverless browser-to-browser rendezvous does not exist on today's web — browsers cannot join UDP DHTs — so the design goal is to minimize trust in infrastructure, not to pretend there is none. The footprint this study lands on:

- **Discovery brokers**: interchangeable, self-hostable, see only connection metadata and only at session start; use several at once (public list plus your own).
- **TURN relays**: only on failure paths, carry only ciphertext, self-hostable, runnable by any participant.
- **No vendor-proprietary dependency**: every component is an open protocol, and the lab runs nothing — the showcase site (item 2) only serves static files.
- **Desktop goes further**: broker-less DHT discovery (Hyperswarm) and same-LAN discovery for meeting-room sessions.
- **Asynchronous fallback with no session server at all**: the user's own cloud bucket (item 3) as the always-on peer — snapshots plus deltas, each client syncing when online. The bucket belongs to a participant, not to the lab.

## Open questions

- Library first (item 1); this study is deliberately transport-agnostic — all three candidates have transport-agnostic update encodings.
- Which signaling servers to list by default, and whether the lab ships a tiny self-hosted one or relies on public lists plus user configuration.
- TURN defaults: a documented "bring your own" setup (coturn) plus a sensible public list.
- Session size target: a meeting-sized mesh (about 20) is the case to serve; whether larger sessions are in scope at all.
- The access-control model beyond the room password (CRDTs merge whatever arrives; there is no rollback), and how a session handles a peer behaving badly.
