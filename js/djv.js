(function(window, document) {
  window["djv"] = djv;
  djv.version = "0.2.2";

  // active views

  var views = {};

  // view instance id generator

  var IDPrefix = "djv",
    IDCounter = 1;

  function generateID() {
    return IDPrefix + IDCounter++;
  }

  // utils
  
  var defer = setTimeout;

  function attr(elm, prop) {
    return elm.getAttribute("djv-" + prop) || "";
  }

  function runFn(obj, fn, arg1, arg2, arg3) {
    fn && typeof obj[fn] === "function" && obj[fn](arg1, arg2, arg3);
  }

  function setHandler(elm, remove) {
    elm.onkeydown = elm.onkeypress = elm.onkeyup = elm.onclick = elm.oninput = elm.onfocusout = remove
      ? null
      : handler;

    elm[(remove = (remove ? "remove" : "add") + "EventListener")] &&
      elm[remove]("blur", handler, true);
  }
  
  function getHTML(elm){
    return elm.innerHTML;
  }
  
  function setHTML(elm, html){
    elm.innerHTML = html;
  }

  djv["keydown"] = function(evt, keycode, prevent) {
    if (evt.type === "keydown" && keycode === (evt.keyCode || evt.charCode)) {
      if (prevent) {
        evt.preventDefault ? evt.preventDefault() : (evt.returnValue = false);
      }
      return true;
    }
    return false;
  };

  djv["focus"] = function(viewInstance, localID) {
    defer(function() {
      viewInstance.$(localID).focus();
    });
  };

  // view constructor: djv(templateStringOrId [, methods][, defaultState])

  function djv(templateStringOrID, methods, defaultState) {

    methods = methods || {};
    defaultState = defaultState || {};

    var bindings = {},
      localIDs = {},
      template = elm(templateStringOrID);
    template = parseTemplate(
      template ? getHTML(template) : templateStringOrID,
      bindings,
      localIDs
    );

    viewConstructor["_params"] = [
      template,
      bindings,
      localIDs,
      methods,
      defaultState
    ];
    //var viewInstance = viewClass(parentViewInstance, parentLocalID)
    //                   OR viewClass([parentElementOrId]) // root container
    function viewConstructor(parent, parentID, clear, viewID) {
      var viewInstance = obs(),
        children,
        prop;
      
      if(!parent){ // mount to template container
        parent = elm(templateStringOrID);
        clear = true;
      }
      
      // update when attached to DOM
      
      defer(function(){
        viewInstance(viewInstance(null));
        runFn(viewInstance, '$mounted');
      })

      // public interface

      for (prop in methods) {
        viewInstance[prop] = methods[prop];
      }

      viewID = viewInstance["_"] = viewID || generateID();
      children = viewInstance["$children"] = {};
      viewInstance["$"] = function(localID) {
        if (localID = localIDs[localID]) {
          return elm(this["_"] + "_" + localID);
        }
      };
      viewInstance["$destroy"] = function() {
        // TODO: transform to mixin
        var viewInstance = this,
            viewID = viewInstance["_"],
          domElm = elm(viewID + "_1"),
          parent = domElm.parentNode,
          childrenID;
        domElm && parent.removeChild(domElm);
        if (!viewInstance.$parent) {
          // is root view
          setHandler(parent, true);
        } else {
          for (childrenID in children) {
            children[childrenID] && children[childrenID].$destroy();
          }
          viewInstance.$parent.$children[viewID] = void 0;
        }
        views[viewID] = null;
      };

      // root or child view?

      if (parentID && parent.$) {
        // child view
        viewInstance["$parent"] = parent;
        parent.$children[viewID] = viewInstance;
        parent = parent.$(parentID);
      } else if (parent = elm(parent)) {
        // root view
        setHandler(parent);
      }
      
      // $mount hook
      runFn(viewInstance, '$mount');
      
      //parent.innerHTML = (clear ? "" : parent.innerHTML) + template(viewID);
      setHTML(parent, (clear ? "" : getHTML(parent)) + template(viewID));
      views[viewID] = viewInstance;

      // view updater
      viewInstance(defaultState);
      viewInstance(updateViewInstance);
      
      return viewInstance;
    }

    // view updater

    function updateViewInstance(prop, val, avoidID) {
      var a = bindings[prop] || [],
        l = a.length,
        i = 0,
        domElm,
        fun,
        formatted,
        tagName,
        viewID = this._;
      runFn(this, '$update', prop, val);
      for (i; i < l; i++) {
        if (avoidID !== viewID + "_" + a[i] && (domElm = elm(viewID + "_" + a[i]))) {
          //domElm = elm(viewID + "_" + a[i]);
          tagName = domElm.tagName.toLowerCase();
          formatted =
            "" + [(fun = this[attr(domElm, "format")]) ? fun(val) : val]; // run in context => apply to this?
          if (domElm.type === "radio" || domElm.type === "checkbox") {
            domElm.checked = domElm.value === formatted; // val
          } else if (tagName === "input" || tagName === "button") {
            domElm.value = formatted;
          } else if (tagName === "textarea") {
            domElm.value = formatted;
            //setHTML(domElm, formatted);
            domElm.setAttribute("value", formatted); // old IE, fails in chrome?
          } else {
            setHTML(domElm, formatted.replace(/[<>"'&]/g, function(match) {
              return "&#" + match.charCodeAt(0) + ";";
            }));
          }
        }
      }
      runFn(this, '$updated', prop, val);
    }
    
    return viewConstructor;
  }

  // djv.elm(idOrElement); get element by id

  function elm(id) {
    return typeof id.innerHTML === "string" ? id : document.getElementById(id);
  }

  djv["elm"] = elm;

  // parseTemplate(templateString, bindings, localIDs); internal template parser

  // compile regexes only once
  var ptRegEx1 = /\{\{(\w+)(?:[\s\|]+(\w+))?\}\}| djv\=(\"([^\"]*)\"|\'([^\']*)\')|[\x00-\x1f\"\\]/gi,
    ptRegEx2 = /\s*(\w+)\s*\:\s*(\w+)\s*/g,
    ptRegEx3 = /^(\s*<[a-z1-6]+)([^>]*>)/i;

  function parseTemplate(str, bindings, localIDs) {
    var IDcounter = 1,
      regex1 = ptRegEx1, // /\{\{(\w+)(?:[\s\|]+(\w+))?\}\}| djv\=(\"([^\"]*)\"|\'([^\']*)\')|[\x00-\x1f\"\\]/gi,
      regex2 = ptRegEx2, // /\s*(\w+)\s*\:\s*(\w+)\s*/g;
      regex3 = ptRegEx3,
      temp;
    if ((temp = str.match(regex3))) {
      if (!/\sdjv\=[\"\']/.test(temp)) {
        str = str.replace(regex3, '$1 djv=""$2');
      }
    } else {
      str = '<div djv="">' + str + "</div>";
    }
    function replacer2(arr, prop, value) {
      if (prop === "id") {
        localIDs[value] = IDcounter - 1;
      } else if (prop === "bind") {
        (arr = bindings[value] = bindings[value] || [])[arr.length] =
          IDcounter - 1;
      }
      return prop === "radio"
        ? " name=\"'+c+'_" + value + '"'
        : " djv-" + prop + '="' + value + '"';
    }

    return new Function(
      "c",
      "return'" +
        str.replace(regex1, function(m, prop, format, params, p1, p2) {
          return params
            ? " id=\"'+c+'_" +
                IDcounter++ +
                '"' +
                ((p1 || p2 || "").match(regex2) || [])
                  .join(" ")
                  .replace(regex2, replacer2)
            : prop
              ? (((prop = bindings[prop] = bindings[prop] || [])[
                  prop.length
                ] = IDcounter),
                "<span id=\"'+c+'_" +
                  IDcounter++ +
                  '"' +
                  (format ? ' djv-format="' + format + '"' : "") +
                  "></span>")
              : "\\x" + encodeURI(m).slice(-2);
        }) +
        "'"
    );
  }

  djv["_pt"] = parseTemplate;

  // root view event capture handler

  function handler(
    evt,
    elm,
    id,
    key,
    view,
    bind,
    type,
    inputType,
    val,
    fun,
    isBlur
  ) {
    evt = evt || window.event;
    elm = evt.target || evt.srcElement;
    elm = elm.nodeType === 3 ? elm.parentNode : elm;
    id = elm.id || ""; //).split("_");
    view = views[id.split("_")[0]];
    if (view) {
      type = evt.type;
      inputType = "" + elm.type;
      if (type === "keydown" || type === "keypress") {
        runFn(view, "onkey", evt, evt.keyCode || evt.charCode, elm);
      } else if ((bind = attr(elm, "bind"))) {
        if (inputType === "radio" || inputType === "checkbox") {
          if (type === "click") {
            view(bind, elm.checked ? elm.value : "", 0, 1);
          }
        } else if (
          ~"text tel url datetime-local search month week file password number email".indexOf(
            inputType
          ) ||
          elm.tagName.toLowerCase() === "textarea"
        ) {
          isBlur = type === "blur" || type === "focusout";
          val = elm.value;
          //protect id if not blur/focusout
          view(
            bind,
            typeof (fun = view[attr(elm, "parse")]) === "function"
              ? fun(val)
              : val, // what if fn not defined?
            isBlur ? null : id,
            1
          );
          if (isBlur) {
            val = view(bind);
            elm.value =
              typeof (fun = view[attr(elm, "format")]) === "function"
                ? fun(val)
                : val;
          }
        }
      }
      runFn(view, attr(elm, type), evt, evt.keyCode || evt.charCode, elm);
    }
  }

  // obs: observable objects

  obs["ver"] = "0.2";
  djv["obs"] = obs;

  function obs(init) {
    var data = {},
      observers = {},
      iter = 1;

    function notify(prop, msg, val, i) {
      val = getPropVal(data, prop); //CONSIDER: drop computable/callable props, except on object copy
      for (i in observers) {
        observers[i] && observers[i].call(obs, prop, val, msg);
      }
    }

    function getPropVal(obj, prop, preserve) {
      return obj.hasOwnProperty(prop)
        ? typeof obj[prop] === "function" && !preserve
          ? obj[prop].call(obs)
          : obj[prop]
        : void 0;
    }

    function obs(arg1, arg2, arg3, arg4) {
      // obs() => return computed copy
      // obs(null) => return equivalent copy
      // obs(object) => overwrite with object data
      // obs(prop) => get property
      // obs(prop, val [, msg][, onlyIfDifferent])=> set property
      var preserve = arg1 === null,
        args = arguments,
        i,
        target,
        source,
        copy = !args.length || preserve;
      if (copy || typeof arg1 === "object") {
        if (!copy) {
          for (i in arg1) {
            data[i] = arg1[i];
          }
        }
        target = copy ? {} : data;
        source = copy ? data : arg1;
        for (i in data) {
          arg2 = getPropVal(source, i, preserve);
          if (copy ^ (arg2 === void 0)) {
            target[i] = arg2;
          }
          !copy && notify(i, arg3);
        }
        return copy ? target : obs;
      } else if (typeof arg1 === "function") {
        return (function(index) {
          observers[index] = arg1;
          return function() {
            observers[index] = 0;
          };
        })(iter++);
      } else {
        if (1 in args && (!arg4 || data[arg1] !== arg2)) {
          data[arg1] = arg2;
          notify(arg1, arg3);
        }
        return getPropVal(data, arg1); //CONSIDER: drop computable/callable props, except on object copy
      }
    }
    if (init) {
      obs(init);
    }
    return obs;
  }
})(window, document);
