/**
 * @author Akira Sakaguchi <akira.s7171@gmail.com>  
 */
"use strict";
let cache_ =[];
let CVs = [];
let firedCVlabels = [];
let contentLoaded = false;

/**
 * detect Google Ads Conversion  
 */
function listenHTTPRequest(){
  chrome.webRequest.onCompleted.addListener(
    logRequestURL,
    {urls: ["<all_urls>"]}
  );
};

/**
 * check conversions that fires before window loaded
 */
function checkCV (){
  console.log(CVs.length);
  CVs.forEach((CV)=>{
    sendMsg_('CV', CV)
  });
  CVs = [];
　firedCVlabels = [];
  contentLoaded = true;
}

// TODO refactoring this
function logRequestURL(requestDetails) {
  let url = requestDetails.url;
  let code = requestDetails.statusCode;
  if(url.startsWith('https://www.googleadservices.com/pagead/conversion/')){
    let gclawIdx = url.indexOf('&gclaw')
    let gacIdx = url.indexOf('&gac')
    let cvStrIdx = url.indexOf('conversion/');
    let labelIdx = url.indexOf('label=');
    let surl = url.substr(cvStrIdx+1, url.indexOf('/', cvStrIdx+1));

    let gclaw= gclawIdx != -1 ? url.substring(gclawIdx, url.indexOf('&', gclawIdx+1)) : '';
    let gac= gacIdx != -1? url.substring(gacIdx, url.indexOf('&', gacIdx+1)):'';
    let CVid = surl.substring(surl.indexOf('/'), surl.indexOf('/', surl.indexOf('/')+1));
    CVid = CVid.replace('/','');
    let CVlabel= url.substring(labelIdx, url.indexOf('&', labelIdx+1));
    CVlabel= CVlabel.split('=')[1]; // label=VAL => [label, VAL] 

    let cookie = {'gclaw':gclaw, 'gac':gac, 'cvid':CVid, 'cvlabel':CVlabel};
      if(!!contentLoaded){
      if(CVs.length==0){
       CVs.push(cookie);    
      }  
      CVs.forEach((cv)=>{
      if(cv.cvlabel!==CVlabel){
          sendMsg_('CV', cookie);
          CVs.push(cookie);
      }
      });
      } else {
      if(CVs.length==0){
        CVs.push(cookie);    
      }  
      CVs.forEach((cv)=>{
         if(cv.cvlabel!==CVlabel){
            CVs.push(cookie);
         }
      });
    }
  }
};

/**
 * chrome.cookies shoul be called in this file, otherwise it's gonna be undefined  
 */
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  const msg = request.message;
  const domain = request.domain;
  if(msg==='start'){
      watch();
      cache_ =[];
      let enabled = isEnabled_();
      updateIcon_(enabled);
      if(enabled){
        start_(request);
      }
   } else if(msg==='clearCookies'){
      const domains = getDomains_(domain);
        getDomainCookies_(domains[0]).then((firstCookies)=>{
          clearCookies_(firstCookies).then((firstResult)=>{
            getDomainCookies_(domains[1]).then((secondCookies)=>{
              clearCookies_(secondCookies).then((secondResult)=>{
                getDomainCookies_(domains[2]).then((thirdCookies)=>{
                  clearCookies_(thirdCookies).then((thirdResult)=>{    
                    sendResponse(firstResult || secondResult || thirdResult);
                },logCookie);
              },logCookie);
            },logCookie);
          },logCookie);
        },logCookie);
      },logCookie);
    } else if (msg==='clearAll'){
     // from popup.js
      getDomainCookies_().then((cookies)=>{
        clearCookies_(cookies).then((result)=>{
          sendResponse(result);
        },logCookie);
      },logCookie);
    } else if(msg==='getCookies'){
      getCookies(domain).then((result)=>{
        result = filter_(result);
        cache_ = result;
        watch();
        sendMsg_('returnCookies', result);
        checkCV();
      },logCookie);  
    } else if (msg==='setDomainAndCookies'){ 
      getCookies(domain).then((result)=>{
       setCookies_(result);
     },logCookie);
     window.sessionStorage.setItem("domainNm", domain);
　  } else if (msg ==='toggle'){
       toggle_(request);
       stopWatching_();
     } else if (msg ==='stopWatching'){
       stopWatching_();  
     } else if (msg === 'beforeReload'){
      cache_ = [];
      stopWatching_();
      contentLoaded = false;
     } else if (msg === 'beforeLoad'){
      listenHTTPRequest(); 
    }
  return true;
});

/**
 * to & from pupup.js
 * @private 
 * @param{Object} request 
 */
function toggle_(request){
  let shouldEnabled = request.shouldEnabled;
  updateIcon_(shouldEnabled);
  let booleanStr = shouldEnabled ? 'true' : 'false';
  window.localStorage.setItem('enabled', booleanStr);
};

/**
 * @private 
 * @return{Promise}
 * @param{Array} array 
 * @param{Array} cookies 
 */
function push_(array, cookies){
  return new Promise((resolve, reject)=>{
    resolve(array.concat(cookies));
  });
};

/**
 * @private 
 * @return{Array.<String>} domains
 * @param{String} domain 
 */
function getDomains_(domain){
  let domains = [];
  domains.push(domain);
  domain.split('.').length > 2? 
    domains.push(domain.substr(domain.indexOf('.'))):
    domains.push('');
  domain.split('.').length > 3? 
    domains.push(domain.substr(domain.indexOf('.', domain.indexOf('.')+1))):
    domains.push('');
  return domains;
};

/**
 * @private 
 * @return{boolean}
 */
function isEnabled_(){
 return window.localStorage.getItem('enabled') == 'true' ? true : false;
};

/**
 * request from pupup.js
 * @private 
 * @param{boolean} shouldEnabled 
 */
function updateIcon_(shouldEnabled) {
  let suffix = shouldEnabled ? '-on' : '';
  chrome.browserAction.setIcon({path:"../../icon/s128" + suffix + ".png"});
};

/** 
 * @private
 * @param {Array.<Object>} cookies
 * @return {Array.<Object>} filtered cookies
 */
function filter_(cookies){
  let gclAwNm ='_gcl_aw';
  let gacNm ='_gac';
  cookies = cookies.filter((cookie) => {
    return cookie.name.includes(gclAwNm)||cookie.name.includes(gacNm);
  });
  return cookies;
}

/**
 * request from content.js
 * @private  
 * @param {Object} request
 */
function start_(request){
    let domain = request.domain;
    let referrer = request.referrer;
    let isTheSameDomain = isTheSameDomain_(domain);
    if(isTheSameDomain || referrer==''){
      sendMsg_('domainChecked', 'noError');
    } else if(!isTheSameDomain){
      sendMsg_('domainChecked', 'domainChanged');
    } 
};

/**
 * @private 
 * @return {Array.<Object>} cookies
 */
function setCookies_(cookies){
  let JSONcookies = JSON.stringify(cookies);
  window.sessionStorage.setItem('cookies', JSONcookies);
};

/**
 * @private 
 * @return {boolean} 
 * @param {String} domain 
 */
function isTheSameDomain_(domain){
  return domain === window.sessionStorage.getItem("domainNm");
}

/**
 * @private 
 * @return {Promise} 
 * @param {Array.<Object>} cookies - [] default 
 */
function clearCookies_(cookies=[]){
  return new Promise((resolve, reject)=>{ 
      cookies.forEach(function(cookie){
        let url = "http" + (cookie.secure ? "s" : "") + "://" + cookie.domain + cookie.path;
        chrome.cookies.remove({"url": url, "name": cookie.name}, function(cookie){('deleted_cookie', cookie)});
      });
      resolve("cookieCleared");
    });
};

/**
 * @private 
 * @return {Promise} 
 * @param {?string} domaiNm - if null, get all  
 */
function getDomainCookies_(domainNm){
  let detailObj = domainNm ? {domain:domainNm} :{};
  return new Promise((resolve, reject)=>{ 
    // '' is a flag to return empty array
    if(domainNm===''){
      resolve([]);
    }  
    chrome.cookies.getAll(detailObj,((cookies)=>{
      resolve(cookies || []);
    }));
  });
};

/**
 * @private 
 * @param {string} msg 
 * @param {?Any} val
 */
function sendMsg_(msg, val){
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if(!tabs[0]){
      window.alert('please reload the page');
      return;
    }
    // found active tab
    const tabID = tabs[0].id;
    val != undefined ? 
      chrome.tabs.sendMessage(tabID, {message: msg, value: val}):
      chrome.tabs.sendMessage(tabID, {message: msg});
    });
};

/**
 * @param {string} domain
 */
function getCookies(domain){
  let array = [];
  let domains = getDomains_(domain);
  return new Promise((resolve, reject)=>{
    getDomainCookies_(domains[0]).then((firstCookies)=>{
      push_(array, firstCookies).then((firstResult)=>{
        getDomainCookies_(domains[1]).then((secondCookies)=>{
           firstResult = firstResult.filter((cookie)=>{
            return  cookie.name && (cookie.name.startsWith('_gac') || cookie.name.startsWith('_gcl_aw'));
           });
            secondCookies = secondCookies.filter((cookie)=>{
              return  cookie.name && (cookie.name.startsWith('_gac') || cookie.name.startsWith('_gcl_aw'));
             });
            push_(firstResult, secondCookies).then((secondResult)=>{
             getDomainCookies_(domains[2]).then((thirdCookies)=>{
               thirdCookies = thirdCookies.filter((cookie)=>{
                 return  cookie.name && (cookie.name.startsWith('_gac') || cookie.name.startsWith('_gcl_aw'));
               });
               push_(secondResult, thirdCookies).then((finalCookies)=>{
                 resolve(finalCookies);
               },logCookie); 
            },logCookie); 
          },logCookie);
        },logCookie);
      },logCookie);
    },logCookie);
  },logCookie);
};

/**
 * @private
 */
function watch(){
  chrome.cookies.onChanged.addListener(watch_);
};

/**
 * @private
 * @param {Event} e 
 */
 function watch_(e){
  let cookie = e.cookie;
  let name = cookie.name;
  let val = cookie.value;
  let cause = e.cause;
  let isRemoved = e.removed;
  let isChanged = false;
  if(name.includes('_gac') || name.includes('_gcl_aw')){
    if(isEnabled_()){
      if(cause=='explicit' && !isRemoved){
        let filteredCache_ = fileterByName_(name, cache_);
        if(filteredCache_.length === 0){
          isChanged = true;
        } else {
          filteredCache_.forEach((cache)=>{
            isChanged = cache.value.split('.')[2] != val.split('.')[2] ? true:false;
          });
        }
        if(isChanged){
          cache_ = cache_.concat([cookie]);
          sendMsg_('cookiesChanged', cookie);
        }
      }
    }
  }
};

/**
 * @private
 * @param {string} name
 * @param {Array.<string>} cache_
 */
function fileterByName_(name, cache_){
  return cache_ = cache_.filter((cache)=>{
    return cache.name.includes(name);
  });
};

/**
 * @private
 */
function stopWatching_(){
  window.sessionStorage.removeItem('domain');
  window.sessionStorage.removeItem('cookies');
  CVs = [];
  firedCVlabels = [];
  chrome.cookies.onChanged.removeListener(watch_);
};

function logCookie(c) {
  if (chrome.runtime.lastError) {
    console.error(chrome.runtime.lastError);
  } else {
    console.log(c);
  }
}