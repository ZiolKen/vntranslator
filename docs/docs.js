(()=>{ 
  const cfg=window.VNDOCS_CONFIG||{};
  const qs=(s,r=document)=>r.querySelector(s);
  const qsa=(s,r=document)=>Array.from(r.querySelectorAll(s));

  const icons={
    menu:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 6h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 12h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    search:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" stroke-width="2"/><path d="M16.2 16.2 21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    home:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 10.5 12 3l9 7.5V21a1.5 1.5 0 0 1-1.5 1.5h-4.5V15a1.5 1.5 0 0 0-1.5-1.5h-3A1.5 1.5 0 0 0 9 15v7.5H4.5A1.5 1.5 0 0 1 3 21V10.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
    file:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7l-5-5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M14 2v5h5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
    key:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 10a6 6 0 1 1-11.3-3H3v4h2v2h2v2h3.3A6 6 0 0 1 21 10Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M15.5 10.5h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
    book:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
    arrowLeft:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 18 9 12l6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    arrowRight:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    copy:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 9h11v11H9V9Z" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    link:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 13a5 5 0 0 0 7.1 0l1.4-1.4a5 5 0 0 0-7.1-7.1L10 4.9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 11a5 5 0 0 0-7.1 0L5.5 12.4a5 5 0 1 0 7.1 7.1L14 19.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    download:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3v10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 10l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v3h16v-3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    chevronDown:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    hash:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 9h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 15h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10 3 8 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 3l-2 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    close:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
  };

  const toast=(()=>{
    let el;
    const ensure=()=>{
      if(el) return el;
      el=document.createElement('div');
      el.className='gb-toast';
      document.body.appendChild(el);
      return el;
    };
    const show=(msg)=>{
      const node=ensure();
      node.textContent=msg;
      node.classList.add('is-show');
      clearTimeout(node._t);
      node._t=setTimeout(()=>node.classList.remove('is-show'),1200);
    };
    return {show};
  })();

  const copyText=async(text)=>{
    try{
      await navigator.clipboard.writeText(text);
      return true;
    }catch(_){
      try{
        const ta=document.createElement('textarea');
        ta.value=text;
        ta.style.position='fixed';
        ta.style.left='-9999px';
        ta.style.top='0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok=document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      }catch(_){
        return false;
      }
    }
  };

  const norm=(href)=>{
    try{
      const u=new URL(href,location.href);
      const path=u.pathname.replace(/\/+/g,'/').replace(/\/$/,'');
      const parts=path.split('/').filter(Boolean);
      let last=parts.pop()||'';
      if(/index\.html?$/i.test(last)){
        last=parts.pop()||'';
      }
      last=last.replace(/\.html?$/i,'');
      return last;
    }catch(_){
      const raw=String(href||'').split('#')[0].split('?')[0];
      const path=raw.replace(/\/+/g,'/').replace(/\/$/,'');
      const parts=path.split('/').filter(Boolean);
      let last=parts.pop()||'';
      if(/index\.html?$/i.test(last)){
        last=parts.pop()||'';
      }
      last=last.replace(/\.html?$/i,'');
      return last;
    }
  };

  const currentFile=norm(location.href);

  const slugify=(s)=>{
    return String(s||'')
      .trim()
      .toLowerCase()
      .replace(/['"`]/g,'')
      .replace(/[^a-z0-9\s-]/g,'')
      .replace(/\s+/g,'-')
      .replace(/-+/g,'-')
      .replace(/^-|-$/g,'');
  };

  const buildTopbar=()=>{
    const menuBtn=qs('[data-docs="menu"]');
    if(menuBtn) menuBtn.innerHTML=icons.menu;

    const closeNavBtn=qs('[data-docs="closeNav"]');
    if(closeNavBtn) closeNavBtn.innerHTML=icons.close;

    const searchBtn=qs('[data-docs="searchBtn"]');
    if(searchBtn){
      const icon=qs('.gb-searchIcon',searchBtn);
      if(icon) icon.innerHTML=icons.search;
    }

    const searchCloseBtn=qs('[data-docs="searchClose"]');
    if(searchCloseBtn) searchCloseBtn.innerHTML=icons.close;
  };

  const buildSidebar=()=>{
    const host=qs('[data-docs="nav"]');
    if(!host) return;

    const groups=Array.isArray(cfg.nav)?cfg.nav:[];
    const flat=[];

    const back=cfg.back;
    if(back && back.href){
      const a=document.createElement('a');
      a.className='gb-back';
      a.href=back.href;
      a.innerHTML=`${icons.arrowLeft}<span>${back.label||'Back to Translator'}</span>`;
      host.appendChild(a);
    }

    groups.forEach((g)=>{
      const group=document.createElement('div');
      group.className='gb-navGroup';

      const header=document.createElement('div');
      header.className='gb-navGroupHeader';
      const iconKey=g.icon||'book';
      header.innerHTML=`${icons[iconKey]||icons.book}<span>${String(g.label||'').trim()}</span>`;
      group.appendChild(header);

      const list=document.createElement('div');
      list.className='gb-navList';

      (g.items||[]).forEach((it)=>{
        const a=document.createElement('a');
        a.className='gb-navItem';
        a.href=it.href||'#';
        a.innerHTML=`<span class="gb-navDot" aria-hidden="true"></span><span>${it.title||it.label||it.href||'Untitled'}</span>`;

        const id=norm(a.href);
        flat.push({id,title:(it.title||it.label||it.href||'Untitled'),href:a.getAttribute('href'),group:String(g.label||'').trim()});

        if(id===currentFile){
          a.setAttribute('aria-current','page');
        }

        list.appendChild(a);
      });

      group.appendChild(list);
      host.appendChild(group);
    });

    window.__VNDOCS_FLAT=flat;
  };

  const bindNav=()=>{
    const menuBtn=qs('[data-docs="menu"]');
    const overlay=qs('[data-docs="overlay"]');
    const closeBtn=qs('[data-docs="closeNav"]');

    const open=()=>document.body.classList.add('is-navOpen');
    const close=()=>document.body.classList.remove('is-navOpen');

    if(menuBtn) menuBtn.addEventListener('click',()=>{
      if(document.body.classList.contains('is-navOpen')) close();
      else open();
    });
    if(closeBtn) closeBtn.addEventListener('click',close);
    if(overlay) overlay.addEventListener('click',()=>{
      document.body.classList.remove('is-navOpen');
      document.body.classList.remove('is-searchOpen');    });

    document.addEventListener('keydown',(e)=>{
      if(e.key==='Escape'){
        document.body.classList.remove('is-navOpen');
        document.body.classList.remove('is-searchOpen');      }
    });

    qsa('.gb-navItem').forEach((a)=>{
      a.addEventListener('click',()=>{
        if(window.matchMedia('(max-width: 940px)').matches){
          document.body.classList.remove('is-navOpen');
        }
      });
    });
  };

  const buildBreadcrumb=()=>{
    const host=qs('[data-docs="crumb"]');
    if(!host) return;
    const label=cfg.categoryLabel||cfg.category||'Documentation';
    host.innerHTML=`${icons.home}<span>${String(label).toUpperCase()}</span>`;
  };

  const getPageMarkdown=()=>{
    const node=qs('[data-docs="md"]');
    if(node){
      const raw=node.textContent||'';
      return raw.replace(/^\s*\n/,'').trimEnd()+'\n';
    }
    const article=qs('[data-docs="article"]');
    if(!article) return `# ${document.title}\n`;
    const text=(article.innerText||'').trim();
    return `# ${document.title}\n\n${text}\n`;
  };

  const downloadText=(name,text)=>{
    const blob=new Blob([text],{type:'text/markdown;charset=utf-8'});
    const a=document.createElement('a');
    const url=URL.createObjectURL(blob);
    a.href=url;
    a.download=name;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{
      URL.revokeObjectURL(url);
      a.remove();
    },0);
  };

  const buildActions=()=>{
    const btn=qs('[data-docs="copyLink"]');
    if(!btn) return;

    const group=document.createElement('div');
    group.className='gb-copyGroup';
    group.innerHTML=`
      <button type="button" class="gb-actionBtn gb-copyPrimary" data-docs="copyPrimary">${icons.copy}<span>Copy</span></button>
      <button type="button" class="gb-actionBtn gb-copyToggle" data-docs="copyToggle" aria-label="Copy options">${icons.chevronDown}</button>
      <div class="gb-menu" data-docs="copyMenu" aria-hidden="true">
        <button type="button" class="gb-menuItem" data-action="md">${icons.copy}<span>Copy as Markdown</span></button>
        <button type="button" class="gb-menuItem" data-action="link">${icons.link}<span>Copy page link</span></button>
        <button type="button" class="gb-menuItem" data-action="download-md">${icons.download}<span>Download .md</span></button>
      </div>
    `;
    btn.replaceWith(group);

    const primary=qs('[data-docs="copyPrimary"]',group);
    const toggle=qs('[data-docs="copyToggle"]',group);
    const menu=qs('[data-docs="copyMenu"]',group);

    const close=()=>{
      group.classList.remove('is-open');      menu.setAttribute('aria-hidden','true');
    };
    const open=()=>{
      group.classList.add('is-open');      menu.setAttribute('aria-hidden','false');
    };

    primary.addEventListener('click',async()=>{
      const md=getPageMarkdown();
      const ok=await copyText(md);
      toast.show(ok?'Markdown copied.':'Copy failed.');
    });

    toggle.addEventListener('click',(e)=>{
      e.stopPropagation();
      if(group.classList.contains('is-open')) close();
      else open();
    });

    menu.addEventListener('click',async(e)=>{
      const item=e.target.closest('[data-action]');
      if(!item) return;
      const action=item.getAttribute('data-action');
      if(action==='md'){
        const md=getPageMarkdown();
        const ok=await copyText(md);
        toast.show(ok?'Markdown copied.':'Copy failed.');
      }
      if(action==='link'){
        const ok=await copyText(location.href);
        toast.show(ok?'Link copied.':'Copy failed.');
      }
      if(action==='download-md'){
        const md=getPageMarkdown();
        const file=String(currentFile||'page.html').replace(/\.html?$/i,'')||'page';
        downloadText(file+'.md',md);
        toast.show('Downloaded.');
      }
      close();
    });

    document.addEventListener('click',(e)=>{
      if(!group.contains(e.target)) close();
    });
  };

  const enhanceCodeBlocks=()=>{
    const pres=qsa('pre');
    pres.forEach((pre)=>{
      if(pre.closest('.gb-code')) return;

      const wrap=document.createElement('div');
      wrap.className='gb-code';

      const header=document.createElement('div');
      header.className='gb-codeHeader';

      const left=document.createElement('div');
      left.className='gb-codeMeta';
      left.textContent='';

      const btn=document.createElement('button');
      btn.type='button';
      btn.className='gb-copyBtn';
      btn.innerHTML=`${icons.copy}<span>Copy</span>`;
      btn.addEventListener('click',async()=>{
        const code=pre.querySelector('code');
        const text=(code?code.innerText:pre.innerText)||'';
        const ok=await copyText(text);
        toast.show(ok?'Copied.':'Copy failed.');
      });

      header.appendChild(left);
      header.appendChild(btn);

      pre.replaceWith(wrap);
      wrap.appendChild(header);
      wrap.appendChild(pre);
    });
  };

  const enhanceHeadingAnchors=()=>{
    const article=qs('[data-docs="article"]');
    if(!article) return;
    const heads=qsa('h1,h2,h3',article);
    heads.forEach((h)=>{
      if(h.querySelector('.gb-anchor')) return;
      if(!h.id){
        const base=slugify(h.textContent||'section')||'section';
        let id=base;
        let n=2;
        while(document.getElementById(id)) id=`${base}-${n++}`;
        h.id=id;
      }
      const a=document.createElement('button');
      a.type='button';
      a.className='gb-anchor';
      a.setAttribute('aria-label','Copy link to section');
      a.innerHTML=icons.hash;
      a.addEventListener('click',async(e)=>{
        e.stopPropagation();
        const u=new URL(location.href);
        u.hash=h.id;
        const ok=await copyText(u.toString());
        toast.show(ok?'Section link copied.':'Copy failed.');
      });
      h.appendChild(a);
    });
  };

  const buildToc=()=>{
    const toc=qs('[data-docs="toc"]');
    const tocWrap=qs('[data-docs="tocWrap"]');
    const article=qs('[data-docs="article"]');
    if(!toc || !tocWrap || !article) return;

    const levels=cfg.tocLevels||{min:2,max:3};
    const selectors=[];
    for(let l=levels.min;l<=levels.max;l++) selectors.push('h'+l);

    const set=new Set();
    const heads=qsa(selectors.join(','),article).filter((h)=>{
      const t=h.textContent.trim();
      if(!t) return false;
      if(!h.id){
        let base=slugify(t)||'section';
        let id=base;
        let n=2;
        while(set.has(id) || document.getElementById(id)){
          id=`${base}-${n++}`;
        }
        h.id=id;
      }
      set.add(h.id);
      return true;
    });

    if(!heads.length){
      tocWrap.style.display='none';
      return;
    }

    toc.innerHTML='';
    const links=[];

    heads.forEach((h)=>{
      const level=parseInt(h.tagName.slice(1),10);
      const a=document.createElement('a');
      a.href='#'+h.id;
      a.className='gb-tocLink';
      a.dataset.level=String(level);
      a.textContent=h.textContent.trim();
      toc.appendChild(a);
      links.push({id:h.id,el:a});
    });

    const setActive=(id)=>{
      links.forEach((l)=>l.el.classList.toggle('is-active',l.id===id));
    };

    const obs=new IntersectionObserver((entries)=>{
      const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
      if(visible) setActive(visible.target.id);
    },{threshold:[0.25,0.4,0.55],rootMargin:'-18% 0px -70% 0px'});

    heads.forEach(h=>obs.observe(h));

    const hashId=decodeURIComponent(location.hash||'').replace('#','');
    if(hashId) setActive(hashId);
    else setActive(heads[0].id);
  };

  const buildPrevNext=()=>{
    const host=qs('[data-docs="prevNext"]');
    if(!host) return;

    const flat=Array.isArray(window.__VNDOCS_FLAT)?window.__VNDOCS_FLAT:[];
    const idx=flat.findIndex(i=>i.id===currentFile);
    if(idx===-1){
      host.style.display='none';
      return;
    }

    const prev=flat[idx-1]||null;
    const next=flat[idx+1]||null;

    host.innerHTML='';
    host.className='gb-prevNext';

    const card=(it,label,dir)=>{
      if(!it) return null;
      const a=document.createElement('a');
      a.className='gb-navCard';
      a.href=it.href;
      const meta=document.createElement('div');
      meta.className='gb-navCardLabel';
      meta.textContent=label;
      const title=document.createElement('div');
      title.className='gb-navCardTitle';
      title.innerHTML=`${dir==='left'?icons.arrowLeft:icons.arrowRight} <span>${it.title}</span>`;
      title.style.display='flex';
      title.style.alignItems='center';
      title.style.gap='8px';
      a.appendChild(meta);
      a.appendChild(title);
      return a;
    };

    const prevCard=card(prev,'Previous','left');
    const nextCard=card(next,'Next','right');

    if(prevCard) host.appendChild(prevCard);
    if(nextCard) host.appendChild(nextCard);

    if(!prevCard && !nextCard) host.style.display='none';
  };

  const bindSearch=()=>{
    const openBtn=qs('[data-docs="searchBtn"]');
    const overlay=qs('[data-docs="searchOverlay"]');
    const input=qs('[data-docs="searchInput"]');
    const results=qs('[data-docs="searchResults"]');
    const closeBtn=qs('[data-docs="searchClose"]');

    if(!overlay || !input || !results) return;

    const flat=Array.isArray(window.__VNDOCS_FLAT)?window.__VNDOCS_FLAT:[];
    let activeIndex=0;

    const render=(q)=>{
      const query=String(q||'').trim().toLowerCase();
      const items=query?flat.filter(i=>i.title.toLowerCase().includes(query)):flat;
      results.innerHTML='';
      activeIndex=0;

      const list=items.slice(0,12);

      list.forEach((it,i)=>{
        const a=document.createElement('a');
        a.href=it.href;
        a.className='gb-searchItem'+(norm(it.href)===currentFile?' is-active':'');
        a.dataset.index=String(i);
        const t=document.createElement('div');
        t.className='gb-searchItemTitle';
        t.textContent=it.title;
        const m=document.createElement('div');
        m.className='gb-searchItemMeta';
        m.textContent=String(it.group||cfg.categoryLabel||cfg.category||'').toUpperCase();
        a.appendChild(t);
        a.appendChild(m);
        a.addEventListener('click',()=>{
          document.body.classList.remove('is-searchOpen');
        });
        results.appendChild(a);
      });

      if(!list.length){
        const div=document.createElement('div');
        div.className='gb-searchEmpty';
        div.textContent='No results.';
        results.appendChild(div);
      }

      setSearchActive(activeIndex);
    };

    const setSearchActive=(idx)=>{
      const items=qsa('.gb-searchItem',results);
      items.forEach((el)=>el.classList.toggle('is-kb',Number(el.dataset.index)===idx));
    };

    const open=()=>{
      document.body.classList.add('is-searchOpen');
      render(input.value);
      setTimeout(()=>input.focus(),0);
    };

    const close=()=>{
      document.body.classList.remove('is-searchOpen');
      input.value='';
    };

    if(openBtn) openBtn.addEventListener('click',open);
    if(closeBtn) closeBtn.addEventListener('click',close);

    overlay.addEventListener('click',(e)=>{
      if(e.target===overlay) close();
    });

    input.addEventListener('input',()=>render(input.value));

    document.addEventListener('keydown',(e)=>{
      const key=e.key.toLowerCase();
      const isCmd=e.metaKey||e.ctrlKey;

      if(isCmd && key==='k'){
        e.preventDefault();
        if(document.body.classList.contains('is-searchOpen')) close();
        else open();
        return;
      }

      if(document.body.classList.contains('is-searchOpen')){
        if(e.key==='Escape'){
          e.preventDefault();
          close();
          return;
        }

        if(e.key==='ArrowDown' || e.key==='ArrowUp'){
          e.preventDefault();
          const items=qsa('.gb-searchItem',results);
          if(!items.length) return;
          if(e.key==='ArrowDown') activeIndex=Math.min(activeIndex+1,items.length-1);
          else activeIndex=Math.max(activeIndex-1,0);
          setSearchActive(activeIndex);
          return;
        }

        if(e.key==='Enter'){
          const items=qsa('.gb-searchItem',results);
          const el=items.find(x=>Number(x.dataset.index)===activeIndex);
          if(el){
            e.preventDefault();
            el.click();
          }
        }
      }
    });
  };

  const init=()=>{
    buildTopbar();
    buildSidebar();
    buildBreadcrumb();
    buildActions();
    bindNav();
    bindSearch();
    enhanceCodeBlocks();
    enhanceHeadingAnchors();
    buildToc();
    buildPrevNext();
  };

  document.addEventListener('DOMContentLoaded',init);
})(); 
