"use strict";

/* ---------- Queue data structure (linked list, FIFO) ---------- */

class QueueNode {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

class Queue {
  constructor() {
    this.head = null; // front: next to leave
    this.tail = null; // back: latest arrival
    this.length = 0;
  }

  enqueue(item) {
    const node = new QueueNode(item);
    if (this.tail === null) {
      this.head = this.tail = node;
    } else {
      this.tail.next = node;
      this.tail = node;
    }
    this.length++;
  }

  dequeue() {
    if (this.head === null) throw new Error("The queue is empty.");
    const node = this.head;
    this.head = node.next;
    if (this.head === null) this.tail = null;
    this.length--;
    return node.value;
  }

  peek() {
    return this.head === null ? null : this.head.value;
  }

  isEmpty() {
    return this.length === 0;
  }

  toArray() {
    const items = [];
    for (let n = this.head; n !== null; n = n.next) items.push(n.value);
    return items;
  }
}

/* ---------- Service desk logic ---------- */

const SERVICES = {
  deposit: { code: "D", label: "Deposit" },
  loan: { code: "L", label: "Loan" },
  account: { code: "A", label: "New account" },
};

const COUNTER_SERVICES = {
  1: ["deposit", "account"],
  2: ["deposit", "loan"],
  3: ["account", "loan"],
};

class ServiceDesk {
  constructor() {
    this.priority = {};
    this.regular = {};
    this.issued = {};
    for (const s of Object.keys(SERVICES)) {
      this.priority[s] = new Queue();
      this.regular[s] = new Queue();
      this.issued[s] = 0;
    }
    this.current = {};
    for (const id of Object.keys(COUNTER_SERVICES)) this.current[id] = null;
    this.history = [];
    this.seq = 0;
  }

  issueTicket(customer, service, priority) {
    if (!SERVICES[service]) throw new Error("Choose a service.");
    this.issued[service]++;
    this.seq++;
    const ticket = {
      code: SERVICES[service].code + String(this.issued[service]).padStart(3, "0"),
      customer: customer,
      service: service,
      priority: priority,
      seq: this.seq,
      createdAt: Date.now(),
      calledAt: null,
      finishedAt: null,
      counter: null,
    };
    (priority ? this.priority : this.regular)[service].enqueue(ticket);
    return ticket;
  }

  headOf(service) {
    return this.priority[service].peek() || this.regular[service].peek();
  }

  // Priority tickets first; otherwise the customer who arrived earliest.
  callNext(counterId) {
    if (this.current[counterId]) throw new Error("Counter " + counterId + " is still serving a customer.");
    const candidates = COUNTER_SERVICES[counterId]
      .map((s) => this.headOf(s))
      .filter(Boolean);
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => (b.priority - a.priority) || (a.seq - b.seq));
    const best = candidates[0];
    (best.priority ? this.priority : this.regular)[best.service].dequeue();
    best.calledAt = Date.now();
    best.counter = counterId;
    this.current[counterId] = best;
    return best;
  }

  complete(counterId) {
    const ticket = this.current[counterId];
    if (!ticket) throw new Error("Counter " + counterId + " is not serving anyone.");
    ticket.finishedAt = Date.now();
    this.current[counterId] = null;
    this.history.push(ticket);
    return ticket;
  }

  waiting() {
    const all = [];
    for (const s of Object.keys(SERVICES)) {
      all.push(...this.priority[s].toArray(), ...this.regular[s].toArray());
    }
    return all.sort((a, b) => (b.priority - a.priority) || (a.seq - b.seq));
  }

  stats() {
    const inService = Object.values(this.current).filter(Boolean);
    const called = [...this.history, ...inService];
    const waits = called.map((t) => t.calledAt - t.createdAt);
    return {
      served: this.history.length,
      inService: inService.length,
      waiting: this.waiting().length,
      avgWait: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0,
      maxWait: waits.length ? Math.max(...waits) : 0,
    };
  }
}

/* ---------- User interface ---------- */

const desk = new ServiceDesk();
const byId = (id) => document.getElementById(id);

function esc(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function clock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
}

function say(text) {
  byId("message").textContent = text;
}

function renderCounters() {
  byId("counters").innerHTML = Object.keys(COUNTER_SERVICES).map((id) => {
    const t = desk.current[id];
    const handles = COUNTER_SERVICES[id].map((s) => SERVICES[s].label).join(" and ");
    const now = t
      ? '<span class="code">' + t.code + "</span>" +
        '<span class="who">' + esc(t.customer) + (t.priority ? " (priority)" : "") + "</span>" +
        '<span class="timer">Serving for <span data-since="' + t.calledAt + '"></span></span>'
      : '<span class="free">Free</span>';
    return (
      '<article class="counter' + (t ? " busy" : "") + '">' +
      "<h3>Counter " + id + "</h3>" +
      '<p class="handles">Serves ' + handles + "</p>" +
      '<div class="now">' + now + "</div>" +
      '<div class="actions">' +
      '<button type="button" data-act="call" data-id="' + id + '"' + (t ? " disabled" : "") + ">Call next</button>" +
      '<button type="button" data-act="done" data-id="' + id + '"' + (t ? "" : " disabled") + ">Finish</button>" +
      "</div></article>"
    );
  }).join("");
}

function renderLine() {
  const list = desk.waiting();
  byId("line-count").textContent = "(" + list.length + ")";
  byId("line").innerHTML = list.length
    ? list.map((t) =>
        '<li class="' + (t.priority ? "prio" : "") + '">' +
        '<span class="code">' + t.code + "</span>" +
        "<span>" + esc(t.customer) +
        '<span class="svc">' + SERVICES[t.service].label + (t.priority ? ", priority" : "") + "</span></span>" +
        '<span class="wait">Waiting <span data-since="' + t.createdAt + '"></span></span>' +
        "</li>"
      ).join("")
    : '<li class="empty">Nobody is waiting. Take a ticket to join the line.</li>';
}

function renderStats() {
  const s = desk.stats();
  const items = [
    ["Served", s.served],
    ["Being served", s.inService],
    ["Waiting", s.waiting],
    ["Average wait", clock(s.avgWait)],
    ["Longest wait", clock(s.maxWait)],
  ];
  byId("stats").innerHTML = items
    .map((i) => "<div><dt>" + i[0] + "</dt><dd>" + i[1] + "</dd></div>")
    .join("");
}

function tick() {
  const now = Date.now();
  document.querySelectorAll("[data-since]").forEach((el) => {
    el.textContent = clock(now - Number(el.dataset.since));
  });
}

function render() {
  renderCounters();
  renderLine();
  renderStats();
  tick();
}

/* ---------- Events ---------- */

const serviceSelect = byId("service");
serviceSelect.innerHTML = Object.keys(SERVICES)
  .map((k) => '<option value="' + k + '">' + SERVICES[k].label + "</option>")
  .join("");

byId("ticket-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = byId("name").value.trim() || "Guest";
  const ticket = desk.issueTicket(name, serviceSelect.value, byId("priority").checked);
  const ahead = desk.waiting().findIndex((t) => t.seq === ticket.seq);
  say("Ticket " + ticket.code + " for " + name + ". " + ahead + " waiting ahead in the line.");
  byId("name").value = "";
  byId("priority").checked = false;
  render();
});

byId("random").addEventListener("click", () => {
  const names = ["Ada", "Ben", "Chi", "Dee", "Eli", "Fay", "Gus", "Hana", "Ivo", "Jo"];
  const keys = Object.keys(SERVICES);
  for (let i = 0; i < 5; i++) {
    const name = names[Math.floor(Math.random() * names.length)];
    const service = keys[Math.floor(Math.random() * keys.length)];
    desk.issueTicket(name, service, Math.random() < 0.15);
  }
  say("Added 5 random customers to the line.");
  render();
});

byId("counters").addEventListener("click", (e) => {
  const button = e.target.closest("button[data-act]");
  if (!button) return;
  const id = button.dataset.id;
  try {
    if (button.dataset.act === "call") {
      const t = desk.callNext(id);
      say(t ? "Counter " + id + " is calling " + t.code + " (" + t.customer + ")." : "Nobody that counter serves is waiting.");
    } else {
      const t = desk.complete(id);
      say("Counter " + id + " finished " + t.code + ".");
    }
  } catch (err) {
    say(err.message);
  }
  render();
});

render();
setInterval(tick, 1000);
