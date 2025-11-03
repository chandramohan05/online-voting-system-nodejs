# Online Voting Prototype

This is a simple prototype for an online voting system.

Features:
- Admin login (default: admin/admin) and create elections with participants.
- Voter flow: enter Voter ID and phone, receive OTP (simulated on server console), verify within 30 seconds.
- Vote for a participant in an election (one vote per election per voter).
- Results page with pie chart (Chart.js).

Quick start
1. Install dependencies:

   npm install

2. Run server:

   npm start

3. Open http://localhost:3000

Notes
- OTP is simulated: the code is logged to the server console. Replace the `/send-otp` handler in `server.js` to integrate with an SMS provider (e.g., Twilio) for real SMS delivery.
- Sessions are stored in memory for the demo. For production, use a persistent session store and secure secrets.
"Webhook test successful" 
