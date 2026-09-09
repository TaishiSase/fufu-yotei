(function(){
 var status=document.getElementById('familyStatus');
 function connection(){status.textContent=navigator.onLine?'':'オフラインです。共有保存には通信が必要です。';}
 window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
 var key='sase-scroll:'+location.pathname+location.search;
 window.addEventListener('pagehide',function(){try{sessionStorage.setItem(key,String(window.scrollY));}catch(e){}});
 window.addEventListener('pageshow',function(e){if(e.persisted)return;try{var y=Number(sessionStorage.getItem(key));if(y)requestAnimationFrame(function(){window.scrollTo(0,y);});}catch(e){}});
})();