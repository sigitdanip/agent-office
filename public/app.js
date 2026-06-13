let state={teams:{dev:{profiles:[],tasks:[],events:[],comments:[],runs:[],links:[],standup:{}},paper:{profiles:[],tasks:[],events:[],comments:[],runs:[],links:[],standup:{}}},activeTeam:'dev',viewMode:'board',sprints:null,sprintsLoading:false,sprintsError:null,sprintFormVisible:false,sprintEditId:null,sprintDetailId:null,sprintBurndown:null,columns:null,ci:null,ciLoading:false,ciError:null,burndownData:null,burndownLoading:false,burndownSprintId:null};

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

function render(){
  renderRoster();
  if(state.viewMode==='sprints')renderSprintsView();
  else if(state.viewMode==='ci')renderCI();
  else if(state.viewMode==='charts')renderCharts();
  else renderKanban();
  renderActivity();
  renderStandup();
  renderChat();
  updateViewVisibility();
}

function updateViewVisibility(){
  const boardView=document.getElementById('view-board');
  const sprintsView=document.getElementById('view-sprints');
  const ciView=document.getElementById('view-ci');
  const chartsView=document.getElementById('view-charts');
  if(boardView)boardView.style.display=state.viewMode==='board'?'':'none';
  if(sprintsView)sprintsView.style.display=state.viewMode==='sprints'?'':'none';
  if(ciView)ciView.style.display=state.viewMode==='ci'?'':'none';
  if(chartsView)chartsView.style.display=state.viewMode==='charts'?'':'none';
}

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
      ${items.length===0?'<div style="color:var(--text-dim);font-size:11px;padding:20px;text-align:center;font-family:var(--font);letter-spacing:0.5px;">--</div>':''}
      </div>
    </div>`
  }).join('')
}

// --- SPRINTS ---

function fetchSprints(){
  if(state.sprintsLoading)return;
  state.sprintsLoading=true;
  state.sprintsError=null;
  fetch('/api/'+state.activeTeam+'/sprints')
    .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()})
    .then(data=>{state.sprints=(data.sprints||data||[]);state.sprintsLoading=false;scheduleRender()})
    .catch(err=>{state.sprintsError=err.message;state.sprintsLoading=false;scheduleRender()});
}

function fetchColumns(){
  if(state.columns)return;
  fetch('/api/'+state.activeTeam+'/columns')
    .then(r=>r.json())
    .then(data=>{state.columns=data.columns;scheduleRender()})
    .catch(()=>{/* non-critical, use defaults */});
}

function showSprintsView(){
  state.viewMode='board'; // force re-eval
  state.viewMode='sprints';
  state.sprintFormVisible=false;
  state.sprintEditId=null;
  state.sprintDetailId=null;
  state.sprintBurndown=null;
  if(!state.sprints&&!state.sprintsLoading)fetchSprints();
  if(!state.columns)fetchColumns();
  render();
}

function sprintId(s){return s.sprint_id||s.id||''}

function toggleSprintForm(){
  state.sprintFormVisible=!state.sprintFormVisible;
  state.sprintEditId=null;
  scheduleRender();
}

function editSprintForm(sid){
  state.sprintFormVisible=true;
  state.sprintEditId=sid;
  scheduleRender();
}

function cancelSprintForm(){
  state.sprintFormVisible=false;
  state.sprintEditId=null;
  scheduleRender();
}

function handleCreateSprint(formEl){
  var fd=new FormData(formEl);
  var body={sprint_id:fd.get('sprint_id'),name:fd.get('name'),start_date:Number(fd.get('start_date')),end_date:Number(fd.get('end_date')),goal:fd.get('goal')||''};
  if(!body.sprint_id||!body.name||!body.start_date||!body.end_date){alert('Missing required fields: sprint_id, name, start_date, end_date');return;}
  if(body.start_date>=body.end_date){alert('Start date must be before end date');return;}
  fetch('/api/'+state.activeTeam+'/sprints',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    .then(r=>{if(!r.ok)return r.json().then(e=>{throw new Error(e.error||'HTTP '+r.status)});return r.json()})
    .then(()=>{state.sprints=null;state.sprintFormVisible=false;fetchSprints()})
    .catch(err=>{alert('Create failed: '+err.message)});
}

function handleUpdateSprint(formEl,sprintId){
  var fd=new FormData(formEl);
  var body={};
  var name=fd.get('name');if(name)body.name=name;
  var goal=fd.get('goal');if(goal!==null)body.goal=goal;
  var sd=fd.get('start_date');if(sd)body.start_date=Number(sd);
  var ed=fd.get('end_date');if(ed)body.end_date=Number(ed);
  var status=fd.get('status');if(status)body.status=status;
  if(Object.keys(body).length===0){cancelSprintForm();return;}
  fetch('/api/'+state.activeTeam+'/sprints/'+encodeURIComponent(sprintId),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    .then(r=>{if(!r.ok)return r.json().then(e=>{throw new Error(e.error||'HTTP '+r.status)});return r.json()})
    .then(()=>{state.sprints=null;state.sprintFormVisible=false;state.sprintEditId=null;fetchSprints()})
    .catch(err=>{alert('Update failed: '+err.message)});
}

function activateSprint(sid,active){
  var status=active?'active':'planned';
  fetch('/api/'+state.activeTeam+'/sprints/'+encodeURIComponent(sid),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:status})})
    .then(r=>{if(!r.ok)return r.json().then(e=>{throw new Error(e.error||'HTTP '+r.status)});return r.json()})
    .then(()=>{state.sprints=null;fetchSprints()})
    .catch(err=>{alert('Activation failed: '+err.message)});
}

function deleteSprint(sid,name){
  showConfirm('Delete sprint "'+name+'"? This cannot be undone.').then(function(ok){
    if(!ok)return;
    fetch('/api/'+state.activeTeam+'/sprints/'+encodeURIComponent(sid),{method:'DELETE'})
      .then(r=>{if(!r.ok)return r.json().then(e=>{throw new Error(e.error||'HTTP '+r.status)});return r.json()})
      .then(()=>{state.sprints=null;state.sprintDetailId=null;fetchSprints()})
      .catch(err=>{alert('Delete failed: '+err.message)});
  });
}

function toggleSprintDetail(sid){
  if(state.sprintDetailId===sid){state.sprintDetailId=null;state.sprintBurndown=null;scheduleRender();return;}
  state.sprintDetailId=sid;
  state.sprintBurndown=null;
  fetchSprintDetail(sid);
  fetchBurndown(sid);
  scheduleRender();
}

function fetchSprintDetail(sid){
  fetch('/api/'+state.activeTeam+'/sprints/'+encodeURIComponent(sid))
    .then(r=>r.json())
    .then(s=>{
      var idx=state.sprints.findIndex(function(x){return sprintId(x)===sid});
      if(idx>=0){state.sprints[idx]._detail=s;scheduleRender()}
    })
    .catch(function(){});
}

function fetchBurndown(sid){
  fetch('/api/'+state.activeTeam+'/sprints/'+encodeURIComponent(sid)+'/burndown')
    .then(r=>r.json())
    .then(b=>{state.sprintBurndown=b;scheduleRender()})
    .catch(function(){});
}

function renderSprintsView(){
  var el=document.getElementById('sprints-view');
  var ce=document.getElementById('sprint-count');
  if(!el)return;
  el.innerHTML='';

  // -- SPRINT FORM --
  var formSection=document.createElement('div');
  formSection.className='sprint-form-section';
  if(state.sprintFormVisible){
    var editId=state.sprintEditId;
    var editSprint=editId?state.sprints.find(function(s){return sprintId(s)===editId}):null;
    var sd=editSprint?editSprint.start_date:'';
    var ed_=editSprint?editSprint.end_date:'';
    formSection.innerHTML=
      '<div class="sprint-form">'+
      '<div class="sprint-form-title">'+(editId?'Edit Sprint':'New Sprint')+'</div>'+
      '<form onsubmit="event.preventDefault();'+(editId?'handleUpdateSprint(this,\''+esc(editId)+'\')':'handleCreateSprint(this)')+'">'+
      (!editId?'<input name="sprint_id" placeholder="sprint-id (e.g. sprint-1)" required style="font-family:var(--font);">':'')+
      '<input name="name" placeholder="Sprint name" value="'+(editSprint?esc(editSprint.name):'')+'" required>'+
      '<input name="goal" placeholder="Sprint goal (optional)" value="'+(editSprint?esc(editSprint.goal||''):'')+'">'+
      '<div class="sprint-form-row">'+
      '<label>Start <input name="start_date" type="number" placeholder="Unix timestamp" value="'+sd+'" required></label>'+
      '<label>End <input name="end_date" type="number" placeholder="Unix timestamp" value="'+ed_+'" required></label>'+
      '</div>'+
      (editId?'<div class="sprint-form-row"><label>Status <select name="status"><option value="planned"'+(editSprint&&editSprint.status==='planned'?' selected':'')+'>Planned</option><option value="active"'+(editSprint&&editSprint.status==='active'?' selected':'')+'>Active</option><option value="completed"'+(editSprint&&editSprint.status==='completed'?' selected':'')+'>Completed</option><option value="cancelled"'+(editSprint&&editSprint.status==='cancelled'?' selected':'')+'>Cancelled</option></select></label></div>':'')+
      '<div class="sprint-form-actions">'+
      '<button type="submit" class="btn btn-accent">'+(editId?'Update':'Create')+'</button>'+
      '<button type="button" class="btn" onclick="cancelSprintForm()">Cancel</button>'+
      '</div>'+
      '</form></div>';
  }
  el.appendChild(formSection);

  // -- TOOLBAR --
  var toolbar=document.createElement('div');
  toolbar.className='sprint-toolbar';
  toolbar.innerHTML=
    '<button class="btn btn-accent" onclick="toggleSprintForm()">+ New Sprint</button>'+
    '<button class="btn" onclick="fetchSprints()" title="Refresh">Refresh</button>'+
    '<span id="sprint-count-inner" style="font-family:var(--font);font-size:10px;color:var(--text-dim);margin-left:auto;"></span>';
  el.appendChild(toolbar);

  // -- LOADING / ERROR / EMPTY --
  var content=document.createElement('div');
  content.className='sprints-list';

  if(state.sprintsLoading&&!state.sprints){
    content.innerHTML='<div class="loading-state">Loading sprints...</div>';
    el.appendChild(content);
    if(ce)ce.textContent='';
    return;
  }
  if(state.sprintsError){
    content.innerHTML='<div class="error-state">Failed to load: '+esc(state.sprintsError)+'<br><button onclick="fetchSprints()" class="btn" style="margin-top:8px;">Retry</button></div>';
    el.appendChild(content);
    if(ce)ce.textContent='';
    return;
  }
  if(!state.sprints||!state.sprints.length){
    content.innerHTML='<div class="empty-state">No sprints yet<br><span style="font-size:10px;color:var(--text-dim);margin-top:4px;">Create a sprint to get started</span></div>';
    el.appendChild(content);
    if(ce)ce.textContent='0 sprints';
    document.getElementById('sprint-count-inner').textContent='0 sprints';
    return;
  }

  if(ce)ce.textContent=state.sprints.length+' sprints';
  document.getElementById('sprint-count-inner').textContent=state.sprints.length+' sprints';

  var cols=state.columns||getDefaultColumns();

  state.sprints.forEach(function(s){
    var total=s.total_tasks||0;
    var done=s.completed_tasks||0;
    var pct=total>0?Math.round((done/total)*100):0;
    var progressColor=pct===100?'var(--gray)':'var(--accent)';
    var startDate=s.start_date?fmtDate(s.start_date):'--';
    var endDate=s.end_date?fmtDate(s.end_date):'--';
    var byStatus=s.by_status||{};
    var sid=sprintId(s);
    var isActive=s.status==='active';
    var isExpanded=state.sprintDetailId===sid;

    var card=document.createElement('div');
    card.className='sprint-card'+(isActive?' active-sprint':'')+(isExpanded?' expanded':'');
    card.dataset.sprintId=sid;

    card.innerHTML=
      '<div class="sprint-card-header">'+
        '<span class="sprint-name" onclick="event.stopPropagation();toggleSprintDetail(\''+esc(sid)+'\')">'+esc(s.name)+'</span>'+
        '<span class="sprint-status '+esc(s.status||'planned')+'">'+esc(s.status||'planned')+'</span>'+
        '<span class="sprint-card-actions">'+
          '<button class="btn-icon" onclick="event.stopPropagation();editSprintForm(\''+esc(sid)+'\')" title="Edit">E</button>'+
          (!isActive?'<button class="btn-icon btn-icon-accent" onclick="event.stopPropagation();activateSprint(\''+esc(sid)+'\',true)" title="Activate">A</button>':'<button class="btn-icon btn-icon-dim" onclick="event.stopPropagation();activateSprint(\''+esc(sid)+'\',false)" title="Deactivate">D</button>')+
          '<button class="btn-icon btn-icon-danger" onclick="event.stopPropagation();deleteSprint(\''+esc(sid)+'\',\''+esc(s.name)+'\')" title="Delete">X</button>'+
        '</span>'+
      '</div>'+
      (s.goal?'<div class="sprint-goal">'+esc(s.goal)+'</div>':'')+
      '<div class="sprint-dates">'+
        '<span>Start: '+startDate+'</span>'+
        '<span>End: '+endDate+'</span>'+
        '<span style="font-family:var(--font);font-size:9px;color:var(--text-dim);">'+esc(sid)+'</span>'+
      '</div>'+
      '<div class="sprint-progress" onclick="event.stopPropagation();toggleSprintDetail(\''+esc(sid)+'\')">'+
        '<div class="sprint-progress-bar"><div class="sprint-progress-fill" style="width:'+pct+'%;background:'+progressColor+';"></div></div>'+
        '<div class="sprint-progress-text"><span>'+done+'/'+total+' tasks ('+pct+'%)</span></div>'+
      '</div>'+
      '<div class="sprint-col-viz">'+
        cols.map(function(c){
          var count=byStatus[c.id]||0;
          var maxCount=Math.max(1,Math.max.apply(null,Object.values(byStatus))||1);
          var barPct=Math.max(1,Math.round((count/maxCount)*100));
          return '<div class="sprint-col-viz-row">'+
            '<span class="sprint-col-viz-label">'+c.label+'</span>'+
            '<div class="sprint-col-viz-bar-outer"><div class="sprint-col-viz-bar-inner" style="width:'+barPct+'%;'+(count===0?'background:var(--border);':'')+'"></div></div>'+
            '<span class="sprint-col-viz-count">'+count+'</span></div>';
        }).join('')+
      '</div>';

    // -- EXPANDED DETAIL --
    if(isExpanded){
      var detail=s._detail;
      var bd=state.sprintBurndown;
      var detailDiv=document.createElement('div');
      detailDiv.className='sprint-detail';

      var detailHtml='';

      // Burndown chart
      if(bd&&bd.days&&bd.days.length>0){
        detailHtml+='<div class="burndown-section">'+
          '<div class="burndown-title">Burndown ('+bd.totalTasks+' tasks)</div>'+
          '<div class="burndown-chart">';
        var maxTasks=bd.totalTasks||1;
        var barWidth=Math.max(2,Math.floor(100/bd.days.length));
        bd.days.forEach(function(d){
          var remaining=maxTasks-d.cumulative;
          var h=Math.max(2,Math.round((remaining/maxTasks)*60));
          detailHtml+='<div class="burndown-bar-wrap" style="width:'+barWidth+'%;"><div class="burndown-bar" style="height:'+h+'px;'+(d.completed>0?'background:var(--accent);':'')+'" title="'+fmtDate(d.date)+': '+d.cumulative+' done, '+remaining+' remaining"></div></div>';
        });
        detailHtml+='</div><div style="font-family:var(--font);font-size:9px;color:var(--text-dim);text-align:right;">'+bd.days[0]?fmtDate(bd.days[0].date):''+' &rarr; '+fmtDate(bd.days[bd.days.length-1].date)+'</div></div>';
      }

      // Task list
      if(detail&&detail.tasks&&detail.tasks.length>0){
        detailHtml+='<div class="sprint-detail-tasks-header">Tasks ('+detail.tasks.length+')</div>'+
          '<div class="sprint-detail-tasks">'+
          detail.tasks.map(function(t){
            var statusLabel={'parking-lot':'PLOT','brainstorm':'BRN','triage':'TRI','todo':'TODO','ready':'RDY','running':'RUN','blocked':'BLK','review':'REV','done':'DONE','archived':'ARC','scheduled':'SCH'}[t.status]||(t.status||'').slice(0,4).toUpperCase();
            return '<div class="sprint-task-row">'+
              '<span class="sprint-task-status status-'+esc(t.status)+'">'+statusLabel+'</span>'+
              '<span class="sprint-task-title" title="'+esc(t.title)+'">'+esc(t.title||'Untitled')+'</span>'+
              (t.assignee?'<span class="task-badge">'+iconOf(t.assignee)+'</span>':'')+
              '<span class="task-badge" style="'+(t.priority>=2?'color:var(--red);border-color:rgba(225,112,85,0.3)':t.priority===1?'color:var(--yellow);border-color:rgba(253,203,110,0.3)':'color:var(--gray);border-color:var(--border)')+'">P'+(t.priority||0)+'</span>'+
            '</div>';
          }).join('')+
          '</div>';
      }else if(detail&&(!detail.tasks||detail.tasks.length===0)){
        detailHtml+='<div style="color:var(--text-dim);font-size:11px;padding:8px;text-align:center;">No tasks linked to this sprint</div>';
      }else if(!detail){
        detailHtml+='<div class="loading-state" style="height:auto;padding:12px;">Loading tasks...</div>';
      }

      detailDiv.innerHTML=detailHtml;
      card.appendChild(detailDiv);
    }

    content.appendChild(card);
  });

  el.appendChild(content);
}

function showBoardView(){
  state.viewMode='board';
  render();
}

function getDefaultColumns(){
  if(state.activeTeam==='paper'){
    return [
      {id:'triage',label:'Triage'},{id:'todo',label:'Todo'},{id:'ready',label:'Ready'},
      {id:'running',label:'Running'},{id:'review',label:'Review'},{id:'blocked',label:'Blocked'},
      {id:'done',label:'Done'},{id:'archived',label:'Archived'},{id:'scheduled',label:'Scheduled'}
    ];
  }
  return [
    {id:'parking-lot',label:'P.Lot'},{id:'brainstorm',label:'Brain'},{id:'triage',label:'Triage'},
    {id:'todo',label:'Todo'},{id:'ready',label:'Ready'},{id:'running',label:'Running'},
    {id:'review',label:'Review'},{id:'done',label:'Done'},{id:'blocked',label:'Blocked'},
    {id:'archived',label:'Archive'}
  ];
}

// --- CI ---

function fetchCI(){
  if(state.ciLoading)return;
  state.ciLoading=true;
  state.ciError=null;
  fetch('/api/ci?team='+state.activeTeam)
    .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()})
    .then(data=>{state.ci=data;state.ciLoading=false;scheduleRender()})
    .catch(err=>{state.ciError=err.message;state.ciLoading=false;scheduleRender()});
}

function showCIView(){
  state.viewMode='ci';
  if(!state.ci&&!state.ciLoading)fetchCI();
  render();
}

setInterval(function(){
  if(state.viewMode==='ci'&&!state.ciLoading)fetchCI();
}, 60000);

function renderCI(){
  const el=document.getElementById('ci-view');
  const ce=document.getElementById('ci-timer');
  if(!el)return;

  if(state.ciLoading&&!state.ci){
    el.innerHTML='<div class="loading-state">Fetching CI status...</div>';
    ce.textContent='';
    return;
  }
  if(state.ciError){
    el.innerHTML='<div class="error-state">Failed to load CI: '+esc(state.ciError)+'<br><button onclick="fetchCI()" style="margin-top:8px;background:var(--bg-card);border:1px solid var(--border);color:var(--text);padding:4px 12px;cursor:pointer;font-family:var(--font);font-size:11px;">Retry</button></div>';
    ce.textContent='';
    return;
  }

  const data=state.ci;
  if(!data||!data.repos||data.repos.length===0){
    el.innerHTML='<div class="empty-state">No CI configured for this team</div>';
    ce.textContent='';
    return;
  }

  let cacheAge='';
  if(data.cached_at){
    const sec=Math.round((Date.now()-new Date(data.cached_at).getTime())/1000);
    cacheAge=sec+'s ago';
  }
  ce.textContent=cacheAge;

  const agg=data.aggregate||'no_data';
  let aggLabel='No Data';
  let aggClass='ci-badge-unknown';
  if(agg==='failing'){aggLabel='Failing';aggClass='ci-badge-failing'}
  else if(agg==='passing'){aggLabel='Passing';aggClass='ci-badge-passing'}
  else if(agg==='running'){aggLabel='Running';aggClass='ci-badge-running'}
  else if(agg==='no_data'){aggLabel='No Data';aggClass='ci-badge-unknown'}

  el.innerHTML='<div class="ci-aggregate"><span class="ci-aggregate-badge '+aggClass+'">'+aggLabel+'</span><span class="ci-aggregate-label">Aggregate CI Status &mdash; '+esc(data.team||'dev')+'</span></div>'+
    '<div class="ci-repo-list">'+
    data.repos.map(r=>{
      const repoName=r.repo||'unknown';
      const error=r.error||null;
      const runs=r.runs||[];

      let headerClass='ci-repo-ok';
      let statusIcon='&#10003;';
      if(error){headerClass='ci-repo-error';statusIcon='&#10007;'}
      else if(runs.length===0){headerClass='ci-repo-empty';statusIcon='&#8212;'}

      return '<div class="ci-repo">'+
        '<div class="ci-repo-header '+headerClass+'">'+
          '<span class="ci-repo-icon">'+statusIcon+'</span>'+
          '<span class="ci-repo-name">'+esc(repoName)+'</span>'+
          (error?'<span class="ci-repo-error-msg">'+esc(error)+'</span>':'')+
          (!error&&runs.length===0?'<span class="ci-repo-empty-msg">No workflow runs</span>':'')+
        '</div>'+
        (runs.length>0?'<div class="ci-run-list">'+
          runs.slice(0,10).map(run=>{
            const status=run.status||'unknown';
            const conclusion=run.conclusion||null;
            let cls='ci-run-unknown';
            let label='?';
            if(conclusion==='success'){cls='ci-run-pass';label='PASS'}
            else if(conclusion==='failure'){cls='ci-run-fail';label='FAIL'}
            else if(conclusion==='cancelled'){cls='ci-run-cancel';label='CANCEL'}
            else if(conclusion==='skipped'){cls='ci-run-skip';label='SKIP'}
            else if(status==='in_progress'){cls='ci-run-pending';label='RUN'}
            else if(status==='queued'){cls='ci-run-pending';label='WAIT'}

            const runName=run.display_title||run.name||'Workflow';
            const branch=run.head_branch||'';
            const runNum=run.run_number||'';
            const runUrl=run.html_url||'';
            const updated=run.updated_at||'';

            return '<div class="ci-run-row">'+
              '<span class="ci-run-badge '+cls+'">'+label+'</span>'+
              '<span class="ci-run-name">'+(runUrl?'<a href="'+esc(runUrl)+'" target="_blank" rel="noopener" style="color:var(--text);text-decoration:none;">'+esc(runName)+'</a>':esc(runName))+'</span>'+
              (branch?'<span class="ci-run-branch">'+esc(branch)+'</span>':'')+
              (runNum?'<span class="ci-run-num">#'+runNum+'</span>':'')+
              (updated?'<span class="ci-run-time">'+fmtAge(updated)+'</span>':'')+
            '</div>'
          }).join('')+
        '</div>':'')+
      '</div>'
    }).join('')+
    '</div>';

  if(data.error==='partial_errors'){
    const warnEl=document.createElement('div');
    warnEl.className='ci-stale-warning';
    warnEl.textContent='Some repos could not be fetched';
    el.appendChild(warnEl);
  }
}

function fmtAge(dateStr){
  if(!dateStr)return'';
  const then=new Date(dateStr).getTime();
  if(!then)return'';
  const now=Date.now();
  const sec=Math.floor((now-then)/1000);
  if(sec<60)return sec+'s ago';
  if(sec<3600)return Math.floor(sec/60)+'m ago';
  return Math.floor(sec/3600)+'h ago';
}

function renderActivity(){
  const el=document.getElementById('activity-feed');
  const events=current().events||[];
  if(!events.length){el.innerHTML='<div class="empty-state">No activity</div>';return}
  el.innerHTML=events.slice(0, 50).map(e=>{
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
  el.innerHTML=c.slice(0, 30).map(m=>`<div class="chat-msg"><span class="chat-badge">${iconOf(m.author)}</span><span class="chat-author">${esc(m.author)}</span><div class="chat-body">${esc(m.body)}</div><div class="chat-time">${fmt(m.created_at)}</div></div>`).join('')
}

function showTask(id){
  const t=current().tasks.find(x=>x.id===id);if(!t)return;
  document.getElementById('modal-title').textContent=t.title||'Untitled';
  document.getElementById('modal-meta').innerHTML='ID: '+esc(t.id)+' &nbsp;|&nbsp; Assignee: '+(t.assignee?esc(t.assignee):'--')+' &nbsp;|&nbsp; Status: '+(t.status||'--')+' &nbsp;|&nbsp; P'+(t.priority||0)+(t.tenant?' &nbsp;|&nbsp; Sprint: '+esc(t.tenant):'')+(t.created_at?' &nbsp;|&nbsp; '+fmt(t.created_at):'');
  document.getElementById('modal-body').textContent=t.body||'(No description)';
  document.getElementById('modal-overlay').classList.add('open')
}

function fmt(t){if(!t)return'';return new Date(t*1e3).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}
function fmtDate(t){if(!t)return'';const d=new Date(t*1e3);return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'})}
function esc(s){if(!s)return'';var d=document.createElement('div');d.textContent=String(s);return d.innerHTML}

// --- EVENT HANDLERS ---

document.getElementById('kanban-board').onclick=(e)=>{
  const card=e.target.closest('.task-card');
  if(card)showTask(card.dataset.taskId);
};

document.getElementById('sprints-view').onclick=(e)=>{
  // Sprint card interactions handled via onclick attributes in render
  // This handler is a no-op to avoid conflicts
};

document.getElementById('modal-close-btn').onclick=()=>document.getElementById('modal-overlay').classList.remove('open');
document.getElementById('modal-overlay').onclick=e=>{if(e.target===e.currentTarget)document.getElementById('modal-overlay').classList.remove('open')};

// -- confirm dialog (non-blocking, Promise-based) --
var _confirmResolve=null;
function showConfirm(msg){
  document.getElementById('confirm-message').textContent=msg;
  document.getElementById('confirm-overlay').classList.add('open');
  return new Promise(function(resolve){_confirmResolve=resolve;});
}
document.getElementById('confirm-cancel-btn').onclick=function(){
  document.getElementById('confirm-overlay').classList.remove('open');
  if(_confirmResolve){_confirmResolve(false);_confirmResolve=null;}
};
document.getElementById('confirm-delete-btn').onclick=function(){
  document.getElementById('confirm-overlay').classList.remove('open');
  if(_confirmResolve){_confirmResolve(true);_confirmResolve=null;}
};
document.getElementById('confirm-overlay').onclick=function(e){
  if(e.target===e.currentTarget){
    document.getElementById('confirm-overlay').classList.remove('open');
    if(_confirmResolve){_confirmResolve(false);_confirmResolve=null;}
  }
};

document.getElementById('team-tabs').onclick=e=>{
  const tab=e.target.closest('.team-tab');
  if(!tab)return;
  const team=tab.dataset.team;
  if(team===state.activeTeam)return;
  state.activeTeam=team;
  state.sprints=null;
  state.columns=null;
  state.ci=null;
  state.burndownData=null;
  state.burndownSprintId=null;
  document.querySelectorAll('.team-tab').forEach(t=>t.classList.toggle('active',t.dataset.team===team));
  if(state.viewMode==='sprints')fetchSprints();
  else if(state.viewMode==='ci')fetchCI();
  else if(state.viewMode==='charts')fetchSprints();
  render();
};

document.getElementById('view-tabs').onclick=e=>{
  const tab=e.target.closest('.view-tab');
  if(!tab)return;
  const view=tab.dataset.view;
  if(view===state.viewMode)return;
  document.querySelectorAll('.view-tab').forEach(t=>t.classList.toggle('active',t.dataset.view===view));
  document.body.className=document.body.className.replace(/mobile-view-\w+/g,'')+' mobile-view-'+view;
  if(view==='sprints')showSprintsView();
  else if(view==='ci')showCIView();
  else if(view==='charts')showChartsView();
  else showBoardView();
};

document.getElementById('mobile-nav').onclick=function(e){
  const item=e.target.closest('.mobile-nav-item');
  if(!item)return;
  const view=item.dataset.mview;
  document.querySelectorAll('.mobile-nav-item').forEach(i=>i.classList.toggle('active',i.dataset.mview===view));
  document.body.className=document.body.className.replace(/mobile-view-\w+/g,'')+' mobile-view-'+view;

  if(view==='sprints'){
    showSprintsView();
    document.querySelectorAll('#view-tabs .view-tab').forEach(t=>t.classList.toggle('active',t.dataset.view==='sprints'));
  }else if(view==='ci'){
    showCIView();
    document.querySelectorAll('#view-tabs .view-tab').forEach(t=>t.classList.toggle('active',t.dataset.view==='ci'));
  }else if(view==='charts'){
    showChartsView();
    document.querySelectorAll('#view-tabs .view-tab').forEach(t=>t.classList.toggle('active',t.dataset.view==='charts'));
  }else if(view==='board'){
    showBoardView();
    document.querySelectorAll('#view-tabs .view-tab').forEach(t=>t.classList.toggle('active',t.dataset.view==='board'));
  }else{
    showBoardView();
    document.querySelectorAll('#view-tabs .view-tab').forEach(t=>t.classList.toggle('active',t.dataset.view==='board'));
  }
};

document.body.classList.add('mobile-view-board');

// ── CHARTS VIEW ──

function showChartsView(){
  state.viewMode='charts';
  state.sprintBurndown=null;
  if(!state.sprints&&!state.sprintsLoading)fetchSprints();
  render();
}

function fetchChartBurndown(sprintId){
  if(state.burndownLoading)return;
  state.burndownLoading=true;
  state.burndownSprintId=sprintId;
  state.burndownData=null;
  fetch('/api/'+state.activeTeam+'/sprints/'+encodeURIComponent(sprintId)+'/burndown')
    .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()})
    .then(function(data){state.burndownData=data;state.burndownLoading=false;scheduleRender()})
    .catch(function(err){state.burndownData={error:err.message};state.burndownLoading=false;scheduleRender()});
}

function renderCharts(){
  var el=document.getElementById('charts-view');
  var label=document.getElementById('chart-label');
  if(!el)return;

  if(state.sprintsLoading&&!state.sprints){
    el.innerHTML='<div class="loading-state">Loading sprint data...</div>';
    if(label)label.textContent='';
    return;
  }

  var sprints=state.sprints||[];
  var hasSprints=sprints.length>0;

  // Auto-select sprint for burndown
  var defaultSprint=null;
  if(!state.burndownSprintId&&hasSprints){
    defaultSprint=sprints.find(function(s){return s.active;})||sprints.find(function(s){return s.start_date&&s.end_date;})||sprints[0];
    if(defaultSprint){
      fetchChartBurndown(sprintId(defaultSprint));
      if(label)label.textContent=sprints.length+' sprints';
      el.innerHTML='<div class="loading-state">Loading charts...</div>';
      return;
    }
  }

  if(label)label.textContent=sprints.length+' sprints';

  if(!hasSprints){
    el.innerHTML='<div class="empty-state">No sprint data yet<br><span style="font-size:10px;color:var(--text-dim);margin-top:4px;">Create sprints via API and assign tasks to see charts</span></div>';
    return;
  }

  var html='';

  // Sprint selector
  var selectedSprintId=state.burndownSprintId||(defaultSprint?sprintId(defaultSprint):'');
  var sprintOpts=sprints.filter(function(s){return s.start_date&&s.end_date;})
    .map(function(s){
      var sid=sprintId(s);
      return '<option value="'+esc(sid)+'"'+(sid===selectedSprintId?' selected':'')+'>'+esc(s.name||sid)+' ('+esc(s.status||'')+')</option>';
    }).join('');

  html+='<div class="chart-select-row">'+
    '<span style="font-family:var(--font);font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;">Sprint:</span>'+
    '<select class="chart-select" id="burndown-select" onchange="onChartBurndownSelect(this.value)">'+
      (sprintOpts||'<option value="">-- no sprints with dates --</option>')+
    '</select>'+
  '</div>';

  // Burndown chart
  html+='<div class="chart-container" id="burndown-container">';
  if(state.burndownLoading){
    html+='<div class="chart-title">Burndown</div><div class="loading-state" style="height:200px;">Loading burndown...</div>';
  }else if(state.burndownData&&state.burndownData.error){
    html+='<div class="chart-title">Burndown</div><div class="error-state">Failed: '+esc(state.burndownData.error)+'</div>';
  }else if(state.burndownData){
    html+=renderBurndownChart(state.burndownData);
  }else{
    html+='<div class="chart-title">Burndown</div><div class="chart-empty">Select a sprint</div>';
  }
  html+='</div>';

  // Velocity chart
  html+='<div class="chart-container" id="velocity-container">';
  html+=renderVelocityChart(sprints);
  html+='</div>';

  el.innerHTML=html;
}

function onChartBurndownSelect(value){
  if(!value)return;
  state.burndownSprintId=value;
  state.burndownData=null;
  fetchChartBurndown(value);
  render();
}

function renderBurndownChart(data){
  var days=data.days||[];
  var total=data.totalTasks||0;
  var name=data.sprintName||data.sprintId||'Sprint';

  if(days.length===0||total===0){
    return '<div class="chart-title">Burndown &mdash; '+esc(name)+'</div>'+
      '<div class="chart-empty">'+(total===0?'No tasks in this sprint':'No burndown data yet')+'</div>';
  }

  var W=600,H=320,padL=55,padR=20,padT=20,padB=45;
  var chartW=W-padL-padR,chartH=H-padT-padB;
  var dayCount=days.length;
  var i,x,y;

  // Grid & Y labels
  var gridHtml='';
  var yTicks=5;
  for(i=0;i<=yTicks;i++){
    var gy=padT+Math.round((i/yTicks)*chartH);
    var glabel=Math.round((total*(yTicks-i))/yTicks);
    gridHtml+='<line x1="'+padL+'" y1="'+gy+'" x2="'+(padL+chartW)+'" y2="'+gy+'" stroke="#1a3a38" stroke-width="1"/>'+
      '<text x="'+(padL-6)+'" y="'+(gy+4)+'" text-anchor="end" fill="#6b8a86" font-family="monospace" font-size="10">'+glabel+'</text>';
  }

  // X-axis date labels
  var datesHtml='';
  var maxLabels=Math.min(dayCount,8);
  var step=Math.max(1,Math.floor(dayCount/maxLabels));
  for(i=0;i<dayCount;i+=step){
    x=padL+Math.round((i/Math.max(dayCount-1,1))*chartW);
    datesHtml+='<text x="'+x+'" y="'+(H-8)+'" text-anchor="middle" fill="#6b8a86" font-family="monospace" font-size="9">'+fmtDate(days[i].date)+'</text>';
  }
  if(dayCount>1&&(dayCount-1)%step!==0){
    i=dayCount-1;
    x=padL+Math.round((i/Math.max(dayCount-1,1))*chartW);
    datesHtml+='<text x="'+x+'" y="'+(H-8)+'" text-anchor="middle" fill="#6b8a86" font-family="monospace" font-size="9">'+fmtDate(days[i].date)+'</text>';
  }

  // Ideal line
  var idealD='M'+padL+','+padT+' L'+(padL+chartW)+','+(padT+chartH);

  // Actual cumulative line
  var actualPts=[];
  for(i=0;i<dayCount;i++){
    x=padL+Math.round((i/Math.max(dayCount-1,1))*chartW);
    y=padT+chartH-Math.round((days[i].cumulative/total)*chartH);
    actualPts.push(x+','+y);
  }
  var actualD='M'+actualPts.join(' L');

  // Dots
  var dotsHtml='';
  for(i=0;i<dayCount;i++){
    x=padL+Math.round((i/Math.max(dayCount-1,1))*chartW);
    y=padT+chartH-Math.round((days[i].cumulative/total)*chartH);
    dotsHtml+='<circle cx="'+x+'" cy="'+y+'" r="3" fill="#00b894"/>';
  }

  var doneNow=days.length>0?days[days.length-1].cumulative:0;

  return '<div class="chart-title">Burndown &mdash; '+esc(name)+' <span style="font-weight:400;color:var(--text-dim);">('+doneNow+'/'+total+' tasks)</span></div>'+
    '<svg class="chart-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet">'+
    '<rect width="'+W+'" height="'+H+'" fill="transparent"/>'+
    gridHtml+
    '<path d="'+idealD+'" fill="none" stroke="#6b8a86" stroke-width="1" stroke-dasharray="6,4" opacity="0.6"/>'+
    '<path d="'+actualD+'" fill="none" stroke="#00b894" stroke-width="2" stroke-linejoin="round"/>'+
    dotsHtml+
    '<line x1="'+padL+'" y1="'+padT+'" x2="'+padL+'" y2="'+(padT+chartH)+'" stroke="#2a4a48" stroke-width="1"/>'+
    '<line x1="'+padL+'" y1="'+(padT+chartH)+'" x2="'+(padL+chartW)+'" y2="'+(padT+chartH)+'" stroke="#2a4a48" stroke-width="1"/>'+
    datesHtml+
    // Legend
    '<line x1="'+(padL+chartW-140)+'" y1="'+(padT+6)+'" x2="'+(padL+chartW-110)+'" y2="'+(padT+6)+'" stroke="#6b8a86" stroke-width="1" stroke-dasharray="6,4" opacity="0.6"/>'+
    '<text x="'+(padL+chartW-107)+'" y="'+(padT+10)+'" fill="#6b8a86" font-family="monospace" font-size="9">ideal</text>'+
    '<line x1="'+(padL+chartW-70)+'" y1="'+(padT+6)+'" x2="'+(padL+chartW-40)+'" y2="'+(padT+6)+'" stroke="#00b894" stroke-width="2"/>'+
    '<text x="'+(padL+chartW-37)+'" y="'+(padT+10)+'" fill="#00b894" font-family="monospace" font-size="9">actual</text>'+
    '</svg>';
}

function renderVelocityChart(sprints){
  if(!sprints||!sprints.length){
    return '<div class="chart-title">Velocity</div><div class="chart-empty">No sprint data</div>';
  }

  var completed=sprints.filter(function(s){
    return s.status==='completed'&&(s.completed_tasks||0)>0;
  });

  if(completed.length===0){
    completed=sprints.filter(function(s){return (s.completed_tasks||s.total_tasks||0)>0;});
    if(completed.length===0){
      return '<div class="chart-title">Velocity</div><div class="chart-empty">No completed sprints</div>';
    }
  }

  completed=completed.slice(0,10).reverse();

  var W=550,H=280,padL=55,padR=20,padT=20,padB=55;
  var chartW=W-padL-padR,chartH=H-padT-padB;

  var maxTasks=Math.max.apply(null,completed.map(function(s){return s.completed_tasks||0;}));
  if(maxTasks===0)maxTasks=1;

  var gridHtml='';
  var yTicks=4,i,y;
  for(i=0;i<=yTicks;i++){
    y=padT+Math.round((i/yTicks)*chartH);
    gridHtml+='<line x1="'+padL+'" y1="'+y+'" x2="'+(padL+chartW)+'" y2="'+y+'" stroke="#1a3a38" stroke-width="1"/>'+
      '<text x="'+(padL-6)+'" y="'+(y+4)+'" text-anchor="end" fill="#6b8a86" font-family="monospace" font-size="10">'+Math.round(maxTasks-(i/yTicks)*maxTasks)+'</text>';
  }

  var barCount=completed.length;
  var barGap=Math.max(4,Math.min(12,Math.floor(chartW/(barCount*2))));
  var barWidth=Math.floor((chartW-(barCount+1)*barGap)/barCount);
  if(barWidth<8)barWidth=8;

  var barsHtml='',labelsHtml='',countsHtml='';
  for(i=0;i<barCount;i++){
    var bx=padL+barGap+i*(barWidth+barGap);
    var bh=Math.max(2,Math.round(((completed[i].completed_tasks||0)/maxTasks)*chartH));
    var by=padT+chartH-bh;
    barsHtml+='<rect x="'+bx+'" y="'+by+'" width="'+barWidth+'" height="'+bh+'" fill="#00b894" opacity="0.85"/>';
    countsHtml+='<text x="'+(bx+barWidth/2)+'" y="'+(by-4)+'" text-anchor="middle" fill="#00b894" font-family="monospace" font-size="9" font-weight="bold">'+(completed[i].completed_tasks||0)+'</text>';
    var sname=(completed[i].name||completed[i].sprint_id||'').slice(0,10);
    labelsHtml+='<text x="'+(bx+barWidth/2)+'" y="'+(padT+chartH+16)+'" text-anchor="end" fill="#6b8a86" font-family="monospace" font-size="9" transform="rotate(-30,'+(bx+barWidth/2)+','+(padT+chartH+16)+')">'+esc(sname)+'</text>';
  }

  return '<div class="chart-title">Velocity &mdash; '+completed.length+' completed sprint'+(completed.length!==1?'s':'')+'</div>'+
    '<svg class="chart-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet">'+
    '<rect width="'+W+'" height="'+H+'" fill="transparent"/>'+
    gridHtml+
    '<line x1="'+padL+'" y1="'+padT+'" x2="'+padL+'" y2="'+(padT+chartH)+'" stroke="#2a4a48" stroke-width="1"/>'+
    '<line x1="'+padL+'" y1="'+(padT+chartH)+'" x2="'+(padL+chartW)+'" y2="'+(padT+chartH)+'" stroke="#2a4a48" stroke-width="1"/>'+
    barsHtml+countsHtml+labelsHtml+
    '</svg>';
}

connect();
