let state={teams:{dev:{profiles:[],tasks:[],events:[],comments:[],runs:[],links:[],standup:{}},paper:{profiles:[],tasks:[],events:[],comments:[],runs:[],links:[],standup:{}}},activeTeam:'dev'},ws=null;

function current(){return state.teams[state.activeTeam]}

function iconOf(id){
  if(!id)return'--';
  const p=current().profiles.find(x=>x.id===id);
  return p?p.icon:'--'
}

function connect(){
  const url=(typeof __BACKEND_WS__!=='undefined'&&__BACKEND_WS__)?__BACKEND_WS__:`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}`;
  ws=new WebSocket(url);
  ws.onopen=()=>{document.getElementById('conn-status').textContent='Connected';document.getElementById('conn-status').className='connected'};
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='snapshot'||m.type==='delta'){state.teams=m.data;scheduleRender()}};
  ws.onclose=()=>{document.getElementById('conn-status').textContent='Offline';document.getElementById('conn-status').className='disconnected';setTimeout(connect,3000)};
  ws.onerror=()=>ws.close();
}

let renderPending=false;
function scheduleRender(){
  if(!renderPending){
    renderPending=true;
    requestAnimationFrame(()=>{renderPending=false;render()})
  }
}

const COLUMNS=['parking-lot','brainstorm','triage','todo','ready','running','blocked','done'];
const COLS={'parking-lot':'Parking Lot',brainstorm:'Brainstorm',triage:'Triage',todo:'Todo',ready:'Ready',running:'Running',blocked:'Blocked',done:'Done'};

function render(){renderRoster();renderKanban();renderActivity();renderStandup();renderChat()}

function renderRoster(){
  const el=document.getElementById('roster-list');
  const profiles=current().profiles;
  if(!profiles||!profiles.length){el.innerHTML='<div class="empty-state">No team data</div>';return}
  el.innerHTML=profiles.map(p=>`<div class="profile-row">
    <div class="profile-badge">${p.icon||'--'}</div>
    <div class="profile-info"><div class="profile-name">${esc(p.name)}</div><div class="profile-model">${esc(p.model)}</div></div>
    <span class="profile-status status-${p.status||'idle'}">${{running:'Run',blocked:'Blk',idle:'Idle',done:'Done',ready:'Rdy',todo:'Todo',triage:'Trg',brainstorm:'Brm','parking-lot':'Prk'}[p.status]||p.status}</span>
  </div>`).join('')
}

function renderKanban(){
  const el=document.getElementById('kanban-board'),ce=document.getElementById('task-count');
  const tasks=current().tasks||[];ce.textContent=tasks.length+' tasks';
  el.innerHTML=COLUMNS.map(col=>{
    const items=tasks.filter(t=>t.status===col).sort((a,b)=>(b.priority||0)-(a.priority||0));
    return `<div class="kanban-col"><div class="kanban-col-header"><span>${COLS[col]}</span><span class="kanban-col-count">${items.length}</span></div>
      <div class="kanban-col-body">
      ${items.slice(0,50).map(t=>`<div class="task-card" data-task-id="${t.id}">
        <div class="task-title">${esc(t.title||'Untitled')}</div>
        <div class="task-meta">
          ${t.assignee?`<span class="task-badge">${iconOf(t.assignee)}</span>`:''}
          <span class="task-badge" style="${t.priority>=2?'color:var(--red);border-color:rgba(225,112,85,0.3)':t.priority===1?'color:var(--yellow);border-color:rgba(253,203,110,0.3)':'color:var(--gray);border-color:var(--border)'}">P${t.priority||0}</span>
          ${t.tenant?`<span class="badge-tenant">${esc(t.tenant)}</span>`:''}
        </div>
      </div>`).join('')}
      ${items.length===0?'<div style="color:var(--text-dim);font-size:11px;padding:20px;text-align:center;font-family:var(--font);letter-spacing:0.5px;">No active tasks</div>':''}
      </div>
    </div>`
  }).join('')
}

function renderActivity(){
  const el=document.getElementById('activity-feed');
  const events=current().events||[];
  if(!events.length){el.innerHTML='<div class="empty-state">No activity</div>';return}
  el.innerHTML=events.slice(-50).reverse().map(e=>{
    let p='';try{p=JSON.parse(e.payload).message||JSON.parse(e.payload).status||''}catch{}
    return `<div class="event-item"><span class="event-kind kind-${e.kind}">${e.kind.toUpperCase()}</span><span style="color:var(--text-dim)">${esc(e.task_id)}</span>${p?'<span style="color:var(--text)"> &mdash; '+esc(p)+'</span>':''}<div class="event-time">${fmt(e.created_at)}</div></div>`
  }).join('')
}

function renderStandup(){
  const el=document.getElementById('standup-body'),s=current().standup;
  if(!s||!s.byStatus){el.innerHTML='<div class="empty-state">No data</div>';return}
  let html=`<div class="stat-row"><span class="stat-label">Parked</span><span class="stat-value">${s.byStatus['parking-lot']||0}</span></div>
    <div class="stat-row"><span class="stat-label">Queued</span><span class="stat-value">${(s.byStatus.brainstorm||0)+(s.byStatus.triage||0)+(s.byStatus.todo||0)+(s.byStatus.ready||0)}</span></div>
    <div class="stat-row"><span class="stat-label">Running</span><span class="stat-value run">${s.byStatus.running||0}</span></div>
    <div class="stat-row"><span class="stat-label">Blocked</span><span class="stat-value blk">${s.byStatus.blocked||0}</span></div>
    <div class="stat-row"><span class="stat-label">Done</span><span class="stat-value done">${s.byStatus.done||0}</span></div>`;
  if(s.blockers&&s.blockers.length){html+='<div class="blockers-header">Blockers</div>';s.blockers.forEach(t=>{html+=`<div class="blocker-item">[${iconOf(t.assignee)}] ${esc(t.title)}</div>`})}
  el.innerHTML=html
}

function renderChat(){
  const el=document.getElementById('chat-body'),c=current().comments||[];
  if(!c.length){el.innerHTML='<div class="empty-state">No messages</div>';return}
  el.innerHTML=c.slice(-30).reverse().map(m=>`<div class="chat-msg"><span class="chat-badge">${iconOf(m.author)}</span><span class="chat-author">${esc(m.author)}</span><div class="chat-body">${esc(m.body)}</div><div class="chat-time">${fmt(m.created_at)}</div></div>`).join('')
}

function showTask(id){
  const t=current().tasks.find(x=>x.id===id);if(!t)return;
  document.getElementById('modal-title').textContent=t.title||'Untitled';
  document.getElementById('modal-meta').innerHTML='ID: '+esc(t.id)+' &nbsp;|&nbsp; Assignee: '+(t.assignee?esc(t.assignee):'--')+' &nbsp;|&nbsp; Status: '+(t.status||'--')+' &nbsp;|&nbsp; P'+(t.priority||0)+(t.tenant?' &nbsp;|&nbsp; Sprint: '+esc(t.tenant):'')+(t.created_at?' &nbsp;|&nbsp; '+fmt(t.created_at):'');
  document.getElementById('modal-body').textContent=t.body||'(No description)';
  document.getElementById('modal-overlay').classList.add('open')
}

function fmt(t){if(!t)return'';return new Date(t*1e3).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}
function esc(s){if(!s)return'';var d=document.createElement('div');d.textContent=String(s);return d.innerHTML}

document.getElementById('kanban-board').onclick=(e)=>{
  const card=e.target.closest('.task-card');
  if(card)showTask(card.dataset.taskId);
};

document.getElementById('modal-close-btn').onclick=()=>document.getElementById('modal-overlay').classList.remove('open');
document.getElementById('modal-overlay').onclick=e=>{if(e.target===e.currentTarget)document.getElementById('modal-overlay').classList.remove('open')};

document.getElementById('team-tabs').onclick=e=>{
  const tab=e.target.closest('.team-tab');
  if(!tab)return;
  const team=tab.dataset.team;
  if(team===state.activeTeam)return;
  state.activeTeam=team;
  document.querySelectorAll('.team-tab').forEach(t=>t.classList.toggle('active',t.dataset.team===team));
  render()
};

document.getElementById('mobile-nav').onclick=function(e){
  const item=e.target.closest('.mobile-nav-item');
  if(!item)return;
  const view=item.dataset.mview;
  document.querySelectorAll('.mobile-nav-item').forEach(i=>i.classList.toggle('active',i.dataset.mview===view));
  document.body.className=document.body.className.replace(/mobile-view-\w+/g,'')+' mobile-view-'+view;
};

document.body.classList.add('mobile-view-board');

connect();
