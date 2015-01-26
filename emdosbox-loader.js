/*!
 * @overview es6-promise - a tiny implementation of Promises/A+.
 * @copyright Copyright (c) 2014 Yehuda Katz, Tom Dale, Stefan Penner and contributors (Conversion to ES6 API by Jake Archibald)
 * @license   Licensed under MIT license
 *            See https://raw.githubusercontent.com/jakearchibald/es6-promise/master/LICENSE
 * @version   2.0.0
 */

(function() {
    "use strict";

    function $$utils$$objectOrFunction(x) {
      return typeof x === 'function' || (typeof x === 'object' && x !== null);
    }

    function $$utils$$isFunction(x) {
      return typeof x === 'function';
    }

    function $$utils$$isMaybeThenable(x) {
      return typeof x === 'object' && x !== null;
    }

    var $$utils$$_isArray;

    if (!Array.isArray) {
      $$utils$$_isArray = function (x) {
        return Object.prototype.toString.call(x) === '[object Array]';
      };
    } else {
      $$utils$$_isArray = Array.isArray;
    }

    var $$utils$$isArray = $$utils$$_isArray;
    var $$utils$$now = Date.now || function() { return new Date().getTime(); };
    function $$utils$$F() { }

    var $$utils$$o_create = (Object.create || function (o) {
      if (arguments.length > 1) {
        throw new Error('Second argument not supported');
      }
      if (typeof o !== 'object') {
        throw new TypeError('Argument must be an object');
      }
      $$utils$$F.prototype = o;
      return new $$utils$$F();
    });

    var $$asap$$len = 0;

    var $$asap$$default = function asap(callback, arg) {
      $$asap$$queue[$$asap$$len] = callback;
      $$asap$$queue[$$asap$$len + 1] = arg;
      $$asap$$len += 2;
      if ($$asap$$len === 2) {
        // If len is 1, that means that we need to schedule an async flush.
        // If additional callbacks are queued before the queue is flushed, they
        // will be processed by this flush that we are scheduling.
        $$asap$$scheduleFlush();
      }
    };

    var $$asap$$browserGlobal = (typeof window !== 'undefined') ? window : {};
    var $$asap$$BrowserMutationObserver = $$asap$$browserGlobal.MutationObserver || $$asap$$browserGlobal.WebKitMutationObserver;

    // test for web worker but not in IE10
    var $$asap$$isWorker = typeof Uint8ClampedArray !== 'undefined' &&
      typeof importScripts !== 'undefined' &&
      typeof MessageChannel !== 'undefined';

    // node
    function $$asap$$useNextTick() {
      return function() {
        process.nextTick($$asap$$flush);
      };
    }

    function $$asap$$useMutationObserver() {
      var iterations = 0;
      var observer = new $$asap$$BrowserMutationObserver($$asap$$flush);
      var node = document.createTextNode('');
      observer.observe(node, { characterData: true });

      return function() {
        node.data = (iterations = ++iterations % 2);
      };
    }

    // web worker
    function $$asap$$useMessageChannel() {
      var channel = new MessageChannel();
      channel.port1.onmessage = $$asap$$flush;
      return function () {
        channel.port2.postMessage(0);
      };
    }

    function $$asap$$useSetTimeout() {
      return function() {
        setTimeout($$asap$$flush, 1);
      };
    }

    var $$asap$$queue = new Array(1000);

    function $$asap$$flush() {
      for (var i = 0; i < $$asap$$len; i+=2) {
        var callback = $$asap$$queue[i];
        var arg = $$asap$$queue[i+1];

        callback(arg);

        $$asap$$queue[i] = undefined;
        $$asap$$queue[i+1] = undefined;
      }

      $$asap$$len = 0;
    }

    var $$asap$$scheduleFlush;

    // Decide what async method to use to triggering processing of queued callbacks:
    if (typeof process !== 'undefined' && {}.toString.call(process) === '[object process]') {
      $$asap$$scheduleFlush = $$asap$$useNextTick();
    } else if ($$asap$$BrowserMutationObserver) {
      $$asap$$scheduleFlush = $$asap$$useMutationObserver();
    } else if ($$asap$$isWorker) {
      $$asap$$scheduleFlush = $$asap$$useMessageChannel();
    } else {
      $$asap$$scheduleFlush = $$asap$$useSetTimeout();
    }

    function $$$internal$$noop() {}
    var $$$internal$$PENDING   = void 0;
    var $$$internal$$FULFILLED = 1;
    var $$$internal$$REJECTED  = 2;
    var $$$internal$$GET_THEN_ERROR = new $$$internal$$ErrorObject();

    function $$$internal$$selfFullfillment() {
      return new TypeError("You cannot resolve a promise with itself");
    }

    function $$$internal$$cannotReturnOwn() {
      return new TypeError('A promises callback cannot return that same promise.')
    }

    function $$$internal$$getThen(promise) {
      try {
        return promise.then;
      } catch(error) {
        $$$internal$$GET_THEN_ERROR.error = error;
        return $$$internal$$GET_THEN_ERROR;
      }
    }

    function $$$internal$$tryThen(then, value, fulfillmentHandler, rejectionHandler) {
      try {
        then.call(value, fulfillmentHandler, rejectionHandler);
      } catch(e) {
        return e;
      }
    }

    function $$$internal$$handleForeignThenable(promise, thenable, then) {
       $$asap$$default(function(promise) {
        var sealed = false;
        var error = $$$internal$$tryThen(then, thenable, function(value) {
          if (sealed) { return; }
          sealed = true;
          if (thenable !== value) {
            $$$internal$$resolve(promise, value);
          } else {
            $$$internal$$fulfill(promise, value);
          }
        }, function(reason) {
          if (sealed) { return; }
          sealed = true;

          $$$internal$$reject(promise, reason);
        }, 'Settle: ' + (promise._label || ' unknown promise'));

        if (!sealed && error) {
          sealed = true;
          $$$internal$$reject(promise, error);
        }
      }, promise);
    }

    function $$$internal$$handleOwnThenable(promise, thenable) {
      if (thenable._state === $$$internal$$FULFILLED) {
        $$$internal$$fulfill(promise, thenable._result);
      } else if (promise._state === $$$internal$$REJECTED) {
        $$$internal$$reject(promise, thenable._result);
      } else {
        $$$internal$$subscribe(thenable, undefined, function(value) {
          $$$internal$$resolve(promise, value);
        }, function(reason) {
          $$$internal$$reject(promise, reason);
        });
      }
    }

    function $$$internal$$handleMaybeThenable(promise, maybeThenable) {
      if (maybeThenable.constructor === promise.constructor) {
        $$$internal$$handleOwnThenable(promise, maybeThenable);
      } else {
        var then = $$$internal$$getThen(maybeThenable);

        if (then === $$$internal$$GET_THEN_ERROR) {
          $$$internal$$reject(promise, $$$internal$$GET_THEN_ERROR.error);
        } else if (then === undefined) {
          $$$internal$$fulfill(promise, maybeThenable);
        } else if ($$utils$$isFunction(then)) {
          $$$internal$$handleForeignThenable(promise, maybeThenable, then);
        } else {
          $$$internal$$fulfill(promise, maybeThenable);
        }
      }
    }

    function $$$internal$$resolve(promise, value) {
      if (promise === value) {
        $$$internal$$reject(promise, $$$internal$$selfFullfillment());
      } else if ($$utils$$objectOrFunction(value)) {
        $$$internal$$handleMaybeThenable(promise, value);
      } else {
        $$$internal$$fulfill(promise, value);
      }
    }

    function $$$internal$$publishRejection(promise) {
      if (promise._onerror) {
        promise._onerror(promise._result);
      }

      $$$internal$$publish(promise);
    }

    function $$$internal$$fulfill(promise, value) {
      if (promise._state !== $$$internal$$PENDING) { return; }

      promise._result = value;
      promise._state = $$$internal$$FULFILLED;

      if (promise._subscribers.length === 0) {
      } else {
        $$asap$$default($$$internal$$publish, promise);
      }
    }

    function $$$internal$$reject(promise, reason) {
      if (promise._state !== $$$internal$$PENDING) { return; }
      promise._state = $$$internal$$REJECTED;
      promise._result = reason;

      $$asap$$default($$$internal$$publishRejection, promise);
    }

    function $$$internal$$subscribe(parent, child, onFulfillment, onRejection) {
      var subscribers = parent._subscribers;
      var length = subscribers.length;

      parent._onerror = null;

      subscribers[length] = child;
      subscribers[length + $$$internal$$FULFILLED] = onFulfillment;
      subscribers[length + $$$internal$$REJECTED]  = onRejection;

      if (length === 0 && parent._state) {
        $$asap$$default($$$internal$$publish, parent);
      }
    }

    function $$$internal$$publish(promise) {
      var subscribers = promise._subscribers;
      var settled = promise._state;

      if (subscribers.length === 0) { return; }

      var child, callback, detail = promise._result;

      for (var i = 0; i < subscribers.length; i += 3) {
        child = subscribers[i];
        callback = subscribers[i + settled];

        if (child) {
          $$$internal$$invokeCallback(settled, child, callback, detail);
        } else {
          callback(detail);
        }
      }

      promise._subscribers.length = 0;
    }

    function $$$internal$$ErrorObject() {
      this.error = null;
    }

    var $$$internal$$TRY_CATCH_ERROR = new $$$internal$$ErrorObject();

    function $$$internal$$tryCatch(callback, detail) {
      try {
        return callback(detail);
      } catch(e) {
        $$$internal$$TRY_CATCH_ERROR.error = e;
        return $$$internal$$TRY_CATCH_ERROR;
      }
    }

    function $$$internal$$invokeCallback(settled, promise, callback, detail) {
      var hasCallback = $$utils$$isFunction(callback),
          value, error, succeeded, failed;

      if (hasCallback) {
        value = $$$internal$$tryCatch(callback, detail);

        if (value === $$$internal$$TRY_CATCH_ERROR) {
          failed = true;
          error = value.error;
          value = null;
        } else {
          succeeded = true;
        }

        if (promise === value) {
          $$$internal$$reject(promise, $$$internal$$cannotReturnOwn());
          return;
        }

      } else {
        value = detail;
        succeeded = true;
      }

      if (promise._state !== $$$internal$$PENDING) {
        // noop
      } else if (hasCallback && succeeded) {
        $$$internal$$resolve(promise, value);
      } else if (failed) {
        $$$internal$$reject(promise, error);
      } else if (settled === $$$internal$$FULFILLED) {
        $$$internal$$fulfill(promise, value);
      } else if (settled === $$$internal$$REJECTED) {
        $$$internal$$reject(promise, value);
      }
    }

    function $$$internal$$initializePromise(promise, resolver) {
      try {
        resolver(function resolvePromise(value){
          $$$internal$$resolve(promise, value);
        }, function rejectPromise(reason) {
          $$$internal$$reject(promise, reason);
        });
      } catch(e) {
        $$$internal$$reject(promise, e);
      }
    }

    function $$$enumerator$$makeSettledResult(state, position, value) {
      if (state === $$$internal$$FULFILLED) {
        return {
          state: 'fulfilled',
          value: value
        };
      } else {
        return {
          state: 'rejected',
          reason: value
        };
      }
    }

    function $$$enumerator$$Enumerator(Constructor, input, abortOnReject, label) {
      this._instanceConstructor = Constructor;
      this.promise = new Constructor($$$internal$$noop, label);
      this._abortOnReject = abortOnReject;

      if (this._validateInput(input)) {
        this._input     = input;
        this.length     = input.length;
        this._remaining = input.length;

        this._init();

        if (this.length === 0) {
          $$$internal$$fulfill(this.promise, this._result);
        } else {
          this.length = this.length || 0;
          this._enumerate();
          if (this._remaining === 0) {
            $$$internal$$fulfill(this.promise, this._result);
          }
        }
      } else {
        $$$internal$$reject(this.promise, this._validationError());
      }
    }

    $$$enumerator$$Enumerator.prototype._validateInput = function(input) {
      return $$utils$$isArray(input);
    };

    $$$enumerator$$Enumerator.prototype._validationError = function() {
      return new Error('Array Methods must be provided an Array');
    };

    $$$enumerator$$Enumerator.prototype._init = function() {
      this._result = new Array(this.length);
    };

    var $$$enumerator$$default = $$$enumerator$$Enumerator;

    $$$enumerator$$Enumerator.prototype._enumerate = function() {
      var length  = this.length;
      var promise = this.promise;
      var input   = this._input;

      for (var i = 0; promise._state === $$$internal$$PENDING && i < length; i++) {
        this._eachEntry(input[i], i);
      }
    };

    $$$enumerator$$Enumerator.prototype._eachEntry = function(entry, i) {
      var c = this._instanceConstructor;
      if ($$utils$$isMaybeThenable(entry)) {
        if (entry.constructor === c && entry._state !== $$$internal$$PENDING) {
          entry._onerror = null;
          this._settledAt(entry._state, i, entry._result);
        } else {
          this._willSettleAt(c.resolve(entry), i);
        }
      } else {
        this._remaining--;
        this._result[i] = this._makeResult($$$internal$$FULFILLED, i, entry);
      }
    };

    $$$enumerator$$Enumerator.prototype._settledAt = function(state, i, value) {
      var promise = this.promise;

      if (promise._state === $$$internal$$PENDING) {
        this._remaining--;

        if (this._abortOnReject && state === $$$internal$$REJECTED) {
          $$$internal$$reject(promise, value);
        } else {
          this._result[i] = this._makeResult(state, i, value);
        }
      }

      if (this._remaining === 0) {
        $$$internal$$fulfill(promise, this._result);
      }
    };

    $$$enumerator$$Enumerator.prototype._makeResult = function(state, i, value) {
      return value;
    };

    $$$enumerator$$Enumerator.prototype._willSettleAt = function(promise, i) {
      var enumerator = this;

      $$$internal$$subscribe(promise, undefined, function(value) {
        enumerator._settledAt($$$internal$$FULFILLED, i, value);
      }, function(reason) {
        enumerator._settledAt($$$internal$$REJECTED, i, reason);
      });
    };

    var $$promise$all$$default = function all(entries, label) {
      return new $$$enumerator$$default(this, entries, true /* abort on reject */, label).promise;
    };

    var $$promise$race$$default = function race(entries, label) {
      /*jshint validthis:true */
      var Constructor = this;

      var promise = new Constructor($$$internal$$noop, label);

      if (!$$utils$$isArray(entries)) {
        $$$internal$$reject(promise, new TypeError('You must pass an array to race.'));
        return promise;
      }

      var length = entries.length;

      function onFulfillment(value) {
        $$$internal$$resolve(promise, value);
      }

      function onRejection(reason) {
        $$$internal$$reject(promise, reason);
      }

      for (var i = 0; promise._state === $$$internal$$PENDING && i < length; i++) {
        $$$internal$$subscribe(Constructor.resolve(entries[i]), undefined, onFulfillment, onRejection);
      }

      return promise;
    };

    var $$promise$resolve$$default = function resolve(object, label) {
      /*jshint validthis:true */
      var Constructor = this;

      if (object && typeof object === 'object' && object.constructor === Constructor) {
        return object;
      }

      var promise = new Constructor($$$internal$$noop, label);
      $$$internal$$resolve(promise, object);
      return promise;
    };

    var $$promise$reject$$default = function reject(reason, label) {
      /*jshint validthis:true */
      var Constructor = this;
      var promise = new Constructor($$$internal$$noop, label);
      $$$internal$$reject(promise, reason);
      return promise;
    };

    var $$es6$promise$promise$$counter = 0;

    function $$es6$promise$promise$$needsResolver() {
      throw new TypeError('You must pass a resolver function as the first argument to the promise constructor');
    }

    function $$es6$promise$promise$$needsNew() {
      throw new TypeError("Failed to construct 'Promise': Please use the 'new' operator, this object constructor cannot be called as a function.");
    }

    var $$es6$promise$promise$$default = $$es6$promise$promise$$Promise;

    /**
      Promise objects represent the eventual result of an asynchronous operation. The
      primary way of interacting with a promise is through its `then` method, which
      registers callbacks to receive either a promise’s eventual value or the reason
      why the promise cannot be fulfilled.

      Terminology
      -----------

      - `promise` is an object or function with a `then` method whose behavior conforms to this specification.
      - `thenable` is an object or function that defines a `then` method.
      - `value` is any legal JavaScript value (including undefined, a thenable, or a promise).
      - `exception` is a value that is thrown using the throw statement.
      - `reason` is a value that indicates why a promise was rejected.
      - `settled` the final resting state of a promise, fulfilled or rejected.

      A promise can be in one of three states: pending, fulfilled, or rejected.

      Promises that are fulfilled have a fulfillment value and are in the fulfilled
      state.  Promises that are rejected have a rejection reason and are in the
      rejected state.  A fulfillment value is never a thenable.

      Promises can also be said to *resolve* a value.  If this value is also a
      promise, then the original promise's settled state will match the value's
      settled state.  So a promise that *resolves* a promise that rejects will
      itself reject, and a promise that *resolves* a promise that fulfills will
      itself fulfill.


      Basic Usage:
      ------------

      ```js
      var promise = new Promise(function(resolve, reject) {
        // on success
        resolve(value);

        // on failure
        reject(reason);
      });

      promise.then(function(value) {
        // on fulfillment
      }, function(reason) {
        // on rejection
      });
      ```

      Advanced Usage:
      ---------------

      Promises shine when abstracting away asynchronous interactions such as
      `XMLHttpRequest`s.

      ```js
      function getJSON(url) {
        return new Promise(function(resolve, reject){
          var xhr = new XMLHttpRequest();

          xhr.open('GET', url);
          xhr.onreadystatechange = handler;
          xhr.responseType = 'json';
          xhr.setRequestHeader('Accept', 'application/json');
          xhr.send();

          function handler() {
            if (this.readyState === this.DONE) {
              if (this.status === 200) {
                resolve(this.response);
              } else {
                reject(new Error('getJSON: `' + url + '` failed with status: [' + this.status + ']'));
              }
            }
          };
        });
      }

      getJSON('/posts.json').then(function(json) {
        // on fulfillment
      }, function(reason) {
        // on rejection
      });
      ```

      Unlike callbacks, promises are great composable primitives.

      ```js
      Promise.all([
        getJSON('/posts'),
        getJSON('/comments')
      ]).then(function(values){
        values[0] // => postsJSON
        values[1] // => commentsJSON

        return values;
      });
      ```

      @class Promise
      @param {function} resolver
      Useful for tooling.
      @constructor
    */
    function $$es6$promise$promise$$Promise(resolver) {
      this._id = $$es6$promise$promise$$counter++;
      this._state = undefined;
      this._result = undefined;
      this._subscribers = [];

      if ($$$internal$$noop !== resolver) {
        if (!$$utils$$isFunction(resolver)) {
          $$es6$promise$promise$$needsResolver();
        }

        if (!(this instanceof $$es6$promise$promise$$Promise)) {
          $$es6$promise$promise$$needsNew();
        }

        $$$internal$$initializePromise(this, resolver);
      }
    }

    $$es6$promise$promise$$Promise.all = $$promise$all$$default;
    $$es6$promise$promise$$Promise.race = $$promise$race$$default;
    $$es6$promise$promise$$Promise.resolve = $$promise$resolve$$default;
    $$es6$promise$promise$$Promise.reject = $$promise$reject$$default;

    $$es6$promise$promise$$Promise.prototype = {
      constructor: $$es6$promise$promise$$Promise,

    /**
      The primary way of interacting with a promise is through its `then` method,
      which registers callbacks to receive either a promise's eventual value or the
      reason why the promise cannot be fulfilled.

      ```js
      findUser().then(function(user){
        // user is available
      }, function(reason){
        // user is unavailable, and you are given the reason why
      });
      ```

      Chaining
      --------

      The return value of `then` is itself a promise.  This second, 'downstream'
      promise is resolved with the return value of the first promise's fulfillment
      or rejection handler, or rejected if the handler throws an exception.

      ```js
      findUser().then(function (user) {
        return user.name;
      }, function (reason) {
        return 'default name';
      }).then(function (userName) {
        // If `findUser` fulfilled, `userName` will be the user's name, otherwise it
        // will be `'default name'`
      });

      findUser().then(function (user) {
        throw new Error('Found user, but still unhappy');
      }, function (reason) {
        throw new Error('`findUser` rejected and we're unhappy');
      }).then(function (value) {
        // never reached
      }, function (reason) {
        // if `findUser` fulfilled, `reason` will be 'Found user, but still unhappy'.
        // If `findUser` rejected, `reason` will be '`findUser` rejected and we're unhappy'.
      });
      ```
      If the downstream promise does not specify a rejection handler, rejection reasons will be propagated further downstream.

      ```js
      findUser().then(function (user) {
        throw new PedagogicalException('Upstream error');
      }).then(function (value) {
        // never reached
      }).then(function (value) {
        // never reached
      }, function (reason) {
        // The `PedgagocialException` is propagated all the way down to here
      });
      ```

      Assimilation
      ------------

      Sometimes the value you want to propagate to a downstream promise can only be
      retrieved asynchronously. This can be achieved by returning a promise in the
      fulfillment or rejection handler. The downstream promise will then be pending
      until the returned promise is settled. This is called *assimilation*.

      ```js
      findUser().then(function (user) {
        return findCommentsByAuthor(user);
      }).then(function (comments) {
        // The user's comments are now available
      });
      ```

      If the assimliated promise rejects, then the downstream promise will also reject.

      ```js
      findUser().then(function (user) {
        return findCommentsByAuthor(user);
      }).then(function (comments) {
        // If `findCommentsByAuthor` fulfills, we'll have the value here
      }, function (reason) {
        // If `findCommentsByAuthor` rejects, we'll have the reason here
      });
      ```

      Simple Example
      --------------

      Synchronous Example

      ```javascript
      var result;

      try {
        result = findResult();
        // success
      } catch(reason) {
        // failure
      }
      ```

      Errback Example

      ```js
      findResult(function(result, err){
        if (err) {
          // failure
        } else {
          // success
        }
      });
      ```

      Promise Example;

      ```javascript
      findResult().then(function(result){
        // success
      }, function(reason){
        // failure
      });
      ```

      Advanced Example
      --------------

      Synchronous Example

      ```javascript
      var author, books;

      try {
        author = findAuthor();
        books  = findBooksByAuthor(author);
        // success
      } catch(reason) {
        // failure
      }
      ```

      Errback Example

      ```js

      function foundBooks(books) {

      }

      function failure(reason) {

      }

      findAuthor(function(author, err){
        if (err) {
          failure(err);
          // failure
        } else {
          try {
            findBoooksByAuthor(author, function(books, err) {
              if (err) {
                failure(err);
              } else {
                try {
                  foundBooks(books);
                } catch(reason) {
                  failure(reason);
                }
              }
            });
          } catch(error) {
            failure(err);
          }
          // success
        }
      });
      ```

      Promise Example;

      ```javascript
      findAuthor().
        then(findBooksByAuthor).
        then(function(books){
          // found books
      }).catch(function(reason){
        // something went wrong
      });
      ```

      @method then
      @param {Function} onFulfilled
      @param {Function} onRejected
      Useful for tooling.
      @return {Promise}
    */
      then: function(onFulfillment, onRejection) {
        var parent = this;
        var state = parent._state;

        if (state === $$$internal$$FULFILLED && !onFulfillment || state === $$$internal$$REJECTED && !onRejection) {
          return this;
        }

        var child = new this.constructor($$$internal$$noop);
        var result = parent._result;

        if (state) {
          var callback = arguments[state - 1];
          $$asap$$default(function(){
            $$$internal$$invokeCallback(state, child, callback, result);
          });
        } else {
          $$$internal$$subscribe(parent, child, onFulfillment, onRejection);
        }

        return child;
      },

    /**
      `catch` is simply sugar for `then(undefined, onRejection)` which makes it the same
      as the catch block of a try/catch statement.

      ```js
      function findAuthor(){
        throw new Error('couldn't find that author');
      }

      // synchronous
      try {
        findAuthor();
      } catch(reason) {
        // something went wrong
      }

      // async with promises
      findAuthor().catch(function(reason){
        // something went wrong
      });
      ```

      @method catch
      @param {Function} onRejection
      Useful for tooling.
      @return {Promise}
    */
      'catch': function(onRejection) {
        return this.then(null, onRejection);
      }
    };

    var $$es6$promise$polyfill$$default = function polyfill() {
      var local;

      if (typeof global !== 'undefined') {
        local = global;
      } else if (typeof window !== 'undefined' && window.document) {
        local = window;
      } else {
        local = self;
      }

      var es6PromiseSupport =
        "Promise" in local &&
        // Some of these methods are missing from
        // Firefox/Chrome experimental implementations
        "resolve" in local.Promise &&
        "reject" in local.Promise &&
        "all" in local.Promise &&
        "race" in local.Promise &&
        // Older version of the spec had a resolver object
        // as the arg rather than a function
        (function() {
          var resolve;
          new local.Promise(function(r) { resolve = r; });
          return $$utils$$isFunction(resolve);
        }());

      if (!es6PromiseSupport) {
        local.Promise = $$es6$promise$promise$$default;
      }
    };

    var es6$promise$umd$$ES6Promise = {
      'Promise': $$es6$promise$promise$$default,
      'polyfill': $$es6$promise$polyfill$$default
    };

    /* global define:true module:true window: true */
    if (typeof define === 'function' && define['amd']) {
      define(function() { return es6$promise$umd$$ES6Promise; });
    } else if (typeof module !== 'undefined' && module['exports']) {
      module['exports'] = es6$promise$umd$$ES6Promise;
    } else if (typeof this !== 'undefined') {
      this['ES6Promise'] = es6$promise$umd$$ES6Promise;
    }
}).call(this);

var Module = null;

(function (Promise) {
   function DOSBOX(canvas, module, game, precallback, callback, scale) {
     var self = this;
     if (this === window) {
         self = {};
     }

     var gofullscreen = document.getElementById("gofullscreen");
     gofullscreen.disabled = true;

     function requestFullScreen () {
       // enlarge the canvas and go to full screen mode
       if (typeof JSEvents !== 'undefined') {
         JSEvents.requestFullscreen(canvas, { scaleMode: 2, filteringMode: 1, canvasResolutionScaleMode: 0 });
       }
     }

     if (fullscreenAvailable()) {
       gofullscreen.addEventListener('click', requestFullScreen);
     }

     var js_url;
     var requests = [];
     var drawloadingtimer;
     var file_countdown;
     var splashimg = new Image();
     var spinnerimg = new Image();
     // TODO: Have an enum value that communicates the current state of DOSBOX, e.g. 'initializing', 'loading', 'running'.
     var has_started = false;
     var loading = false;
     var splash = { loading_text: "",
                    spinning: true,
                    spinner_rotation: 0,
                    finished_loading: false };

     var SAMPLE_RATE = (function () {
       var audio_ctx = window.AudioContext || window.webkitAudioContext || false;
       if (!audio_ctx) {
         return false;
       }
       var sample = new audio_ctx;
       return sample.sampleRate.toString();
     }());

     self.setscale = function(_scale) {
       scale = _scale;
       return self;
     };

     self.setprecallback = function(_precallback) {
       precallback = _precallback;
       return self;
     };

     self.setcallback = function(_callback) {
       callback = _callback;
       return self;
     };

     self.setmodule = function(_module) {
       module = _module;
       return self;
     };

     self.setgame = function(_game) {
       game = _game;
       return self;
     };

     var progress_fetch_file = function (e) {

     };

     var fetch_file = function(title, url, rt, raw, unmanaged) {
       var table = document.getElementById("dosbox-progress-indicator");
       var row, cell;
       if (!table) {
         table = document.createElement('table');
         table.setAttribute('id', "dosbox-progress-indicator");
         table.style.position = 'absolute';
         document.documentElement.appendChild(table);
       }
       row = table.insertRow(-1);
       cell = row.insertCell(-1);
       cell.textContent = '—';
       row.insertCell(-1).textContent = title;

       return new Promise(function (resolve, reject) {
                            var xhr = new XMLHttpRequest();
                            xhr.open('GET', url, true);
                            xhr.responseType = rt ? rt : 'arraybuffer';
                            xhr.onload = function(e) {
                                           if (xhr.status === 200) {
                                             if (!unmanaged) {
                                               xhr.progress = 1.0;
                                             }
                                             cell.textContent = '✔';
                                             resolve(raw ? xhr.response
                                                         : new Int8Array(xhr.response));
                                           }
                                         };
                            xhr.onerror = function (e) {
                                            cell.textContent = '✘';
                                            reject();
                                          };
                            if (!unmanaged) {
                              xhr.onprogress = progress_fetch_file;
                              xhr.title = title;
                              xhr.progress = 0;
                              xhr.total = 0;
                              xhr.loaded = 0;
                              xhr.lengthComputable = false;
                              requests.push(xhr);
                            }
                            xhr.send();
                          });
     };

     var update_countdown = function() {
       file_countdown -= 1;
       if (file_countdown <= 0) {
         loading = false;

         // see archive.js for the mute/unmute button/JS
         if (!($.cookie && $.cookie('unmute'))){
           setTimeout(function(){
             // someone moved it from 1st to 2nd!
             if (DOSBOX && typeof(DOSBOX.sdl_pauseaudio)!='undefined')
               DOSBOX.sdl_pauseaudio(1);
             else if (typeof _SDL_PauseAudio !== "undefined")
               _SDL_PauseAudio(1);
           }, 3000);
         }
       }
     };

     var build_dosbox_arguments = function (config, emulator_start, game_files) {
       splash.loading_text = 'Building arguments';
       var args = [];

       var len = game_files.length;
       for (var i = 0; i < len; i++) {
         args.push('-c', 'mount '+ game_files[i].drive +' '+ game_files[i].mountpoint);
       }

       var path = emulator_start.split(/\\|\//); // I have LTS already
       args.push('-c', /^[a-zA-Z]:$/.test(path[0]) ? path.shift() : 'c:');
       var prog = path.pop();
       if (path && path.length)
         args.push('-c', 'cd '+ path.join('/'));
       args.push('-c', prog);

       return args;
     };

     var get_game_name = function (game_path) {
       return game_path.split('/').pop();
     };

     // NOTE: deliberately use cors.archive.org since this will 302 rewrite to iaXXXXX.us.archive.org/XX/items/...
     // and need to keep that "artificial" extra domain-ish name to avoid CORS issues with IE/Safari
     var get_emulator_config_url = function (module) {
       return '//archive.org/cors/jsmess_engine_v2/' + module + '.json';
     };

     var get_meta_url = function (game_path) {
       var path = game_path.split('/');
       return "//cors.archive.org/cors/"+ path[0] +"/"+ path[0] +"_meta.xml";
     };

     var get_zip_url = function (game_path) {
       return "//cors.archive.org/cors/"+ game_path;
     };

     var get_js_url = function (js_filename) {
       return "//cors.archive.org/cors/jsmess_engine_v2/"+ js_filename;
     };

     var start = function() {
       if (has_started)
         return false;
       has_started = true;

       var k, c, modulecfg, metadata, game_files;
       drawsplash();

       splash.loading_text = 'Downloading game metadata...';
       var loading = fetch_file('Game Metadata',
                                get_meta_url(game),
                                'document', true);
       loading.then(function (data) {
                      metadata = data;
                      splash.loading_text = 'Downloading emulator metadata...';
                      var module = metadata.getElementsByTagName("emulator")
                                           .item(0)
                                           .textContent;
                      return fetch_file('Emulator Metadata',
                                        get_emulator_config_url(module),
                                        'text', true, true);
                    },
                    function () {
                      splash.loading_text = 'Failed to download metadata!';
                      splash.failed_loading = true;
                    })
              .then(function (data) {
                      modulecfg = JSON.parse(data);

                      if (precallback) {
                        window.setTimeout(precallback, 0);
                      }

                      function mountat (drive) {
                        return function (data) {
                          return { drive: drive,
                                   mountpoint: "/" + drive,
                                   data: data
                                 };
                        };
                      }

                      var files = [];
                      if (game) {
                        files.push(fetch_file('Game File: '+ game, get_zip_url(game)).then(mountat("c")));
                      }

                      var len = metadata.documentElement.childNodes.length;
                      for (var i = 0; i < len; i++) {
                        var node = metadata.documentElement.childNodes[i];
                        var m = node.nodeName.match(/^dosbox_drive_([a-zA-Z])$/);
                        if (m) {
                          var file = fetch_file('Game File: '+ node.textContent,
                                                get_zip_url(node.textContent));
                          file.then(mountat(m[1]));
                          files.append(file);
                        }
                      }

                      file_countdown = files.length;
                      splash.loading_text = 'Downloading game data...';

                      return Promise.all(files);
                    },
                    function () {
                      splash.loading_text = 'Failed to download metadata!';
                      splash.failed_loading = true;
                    })
              .then(function (game_data) {
                      game_files = game_data;
                      return new Promise(function (resolve, reject) {
                                           splash.loading_text = 'Press any key to continue...';
                                           splash.spinning = false;

                                           // stashes these event listeners so that we can remove them after
                                           window.addEventListener('keypress', k = keyevent(resolve));
                                           canvas.addEventListener('click', c = resolve);
                                         });
                    },
                    function () {
                      splash.loading_text = 'Failed to download game data!';
                      splash.failed_loading = true;
                    })
              .then(function () {
                      splash.spinning = true;
                      window.removeEventListener('keypress', k);
                      canvas.removeEventListener('click', c);

                      Module = init_module(modulecfg, metadata, game_files);

                      if (modulecfg['js_filename']) {
                        splash.loading_text = 'Launching DosBox';
                        attach_script(modulecfg['js_filename']);
                      } else {
                        splash.loading_text = 'Non-system disk or disk error';
                      }

                      gofullscreen.disabled = !fullscreenAvailable();
                    },
                    function () {
                      splash.loading_text = 'Invalid media, track 0 bad or unusable';
                      splash.failed_loading = true;
                    });
       return self;
     };
     self.start = start;
     window.DOSBOXstart = start;//global hook to method (so can be invoked with a "click to play" image being clicked)

     var init_module = function(modulecfg, metadata, game_files) {
       return { arguments: build_dosbox_arguments(modulecfg,
                                                  metadata.getElementsByTagName("emulator_start")
                                                          .item(0)
                                                          .textContent,
                                                  game_files),
                screenIsReadOnly: true,
                print: function (text) { console.log(text); },
                canvas: canvas,
                noInitialRun: false,
                preInit: function () {
                           splash.loading_text = 'Loading game file(s) into file system';
                           var len = game_files.length;
                           for (var i = 0; i < len; i++) {
                             DOSBOX.BFSMountZip(game_files[i].mountpoint,
                                                new BrowserFS.BFSRequire('buffer').Buffer(game_files[i].data));
                           }
                           DOSBOX.moveConfigToRoot();
                           splash.finished_loading = true;
                           if (callback) {
                               modulecfg.canvas = canvas;
                               window.setTimeout(function() {
                                                   callback(modulecfg, metadata, game_files);
                                                 },
                                                 0);
                           }
                         }
              };
     };

     function keyevent(resolve) {
       return function (e) {
                if (typeof loader_game === 'object')
                  return; // game will start with click-to-play instead of [SPACE] char
                if (e.which == 32) {
                  e.preventDefault();
                  resolve();
                }
              };
     };

     var drawsplash = function () {
       splashimg.onload = function (){
         draw_loading_status(0);
         animLoop(draw_loading_status);
       };
       splashimg.src = '/images/dosbox.png';
       spinnerimg.src = '/images/spinner.png';
     };

     var draw_loading_status = function (deltaT) {
       var context = canvas.getContext('2d');
       context.setTransform(1, 0, 0, 1, 0, 0);
       context.clearRect(0, 0, canvas.width, canvas.height);
       context.drawImage(splashimg, canvas.width / 2 - (splashimg.width / 2), canvas.height / 3 - (splashimg.height / 2));

       var spinnerpos = (canvas.height / 2 + splashimg.height / 2) + 16;
       context.save();
       context.translate((64/2) + 16, spinnerpos);
       context.rotate(splash.spinning ? (splash.spinner_rotation += 2 * (2*Math.PI/1000) * deltaT)
                                      : 0);
       context.drawImage(spinnerimg, -(64/2), -(64/2), 64, 64);
       context.restore();

       context.save();
       context.font = '18px sans-serif';
       context.fillStyle = 'Black';
       context.textAlign = 'center';
       context.fillText(splash.loading_text, canvas.width / 2, (canvas.height / 2) + (splashimg.height / 4));
       context.restore();

       var table = document.getElementById("dosbox-progress-indicator");
       table.style.position = 'absolute';
       table.style.top = (canvas.offsetTop + (canvas.height / 2 + splashimg.height / 2) + 16 - (64/2)) +'px';
       table.style.left = (canvas.offsetLeft + 64 + 32) +'px';

       if (splash.finished_loading) {
         document.getElementById("dosbox-progress-indicator").style.display = 'none';
       }
       if (splash.finished_loading || splash.failed_loading) {
         return false;
       }
       return true;
     };

     function attach_script(js_url) {
         if (js_url) {
           var head = document.getElementsByTagName('head')[0];
           var newScript = document.createElement('script');
           newScript.type = 'text/javascript';
           newScript.src = get_js_url(js_url);
           head.appendChild(newScript);
         }
     }

     function fullscreenAvailable () {
       return !!(canvas.requestFullscreen ||
                 canvas.mozRequestFullScreen ||
                 canvas.mozRequestFullscreen ||
                 canvas.webkitRequestFullscreen ||
                 canvas.msRequestFullscreen);
     };

     function fullscreenEnabled () {
       return document.fullscreenEnabled ||
              document.mozFullscreenEnabled ||
              document.mozFullScreenEnabled ||
              document.webkitFullscreenEnabled ||
              document.msFullscreenEnabled;
     };

     function fullscreenElement () {
       return document.fullscreenElement ||
              document.mozFullscreenElement ||
              document.mozFullScreenElement ||
              document.webkitFullscreenElement ||
              document.msFullscreenElement;
     };
   };

   DOSBOX.BFSMountZip = function BFSMount(path, loadedData) {
       var zipfs = new BrowserFS.FileSystem.ZipFS(loadedData),
           mfs = new BrowserFS.FileSystem.MountableFileSystem(),
           memfs = new BrowserFS.FileSystem.InMemory();
       mfs.mount('/zip', zipfs);
       mfs.mount('/mem', memfs);
       BrowserFS.initialize(mfs);
       // Copy the read-only zip file contents to a writable in-memory storage.
       this.recursiveCopy('/zip', '/mem');
       // Re-initialize BFS to just use the writable in-memory storage.
       BrowserFS.initialize(memfs);
       // Mount the file system into Emscripten.
       var BFS = new BrowserFS.EmscriptenFS();
       FS.mkdir(path);
       FS.mount(BFS, {root: '/'}, path);
   };

   // Helper function: Recursively copies contents from one folder to another.
   DOSBOX.recursiveCopy = function recursiveCopy(oldDir, newDir) {
       var path = BrowserFS.BFSRequire('path'),
           fs = BrowserFS.BFSRequire('fs');
       copyDirectory(oldDir, newDir);
       function copyDirectory(oldDir, newDir) {
           if (!fs.existsSync(newDir)) {
               fs.mkdirSync(newDir);
           }
           fs.readdirSync(oldDir).forEach(function(item) {
               var p = path.resolve(oldDir, item),
                   newP = path.resolve(newDir, item);
               if (fs.statSync(p).isDirectory()) {
                   copyDirectory(p, newP);
               } else {
                   copyFile(p, newP);
               }
           });
       }
       function copyFile(oldFile, newFile) {
           fs.writeFileSync(newFile, fs.readFileSync(oldFile));
       }
   };

   /**
    * Searches for dosbox.conf, and moves it to '/dosbox.conf' so dosbox uses it.
    */
   DOSBOX.moveConfigToRoot = function moveConfigToRoot() {
     if (typeof FS !== 'undefined') {
       var dosboxConfPath = null;
       // Recursively search for dosbox.conf.
       function searchDirectory(dirPath) {
         FS.readdir(dirPath).forEach(function(item) {
           // Avoid infinite recursion by ignoring these entries, which exist at
           // the root.
           if (item === '.' || item === '..') {
             return;
           }
           // Append '/' between dirPath and the item's name... unless dirPath
           // already ends in it (which always occurs if dirPath is the root, '/').
           var itemPath = dirPath + (dirPath[dirPath.length - 1] !== '/' ? "/" : "") + item,
             itemStat = FS.stat(itemPath);
           if (FS.isDir(itemStat.mode)) {
             searchDirectory(itemPath);
           } else if (item === 'dosbox.conf') {
             dosboxConfPath = itemPath;
           }
         });
       }
       searchDirectory('/');

       if (dosboxConfPath !== null) {
         FS.writeFile('/dosbox.conf', FS.readFile(dosboxConfPath), { encoding: 'binary' });
       }
     }
   };

   window.DOSBOX = DOSBOX;
 })(typeof Promise === 'undefined' ? ES6Promise.Promise : Promise);

// Cross browser, backward compatible solution
(function(window, Date) {
   // feature testing
   var raf = window.requestAnimationFrame ||
             window.mozRequestAnimationFrame ||
             window.webkitRequestAnimationFrame ||
             window.msRequestAnimationFrame ||
             window.oRequestAnimationFrame;

   window.animLoop = function (render, element) {
                       var running, lastFrame = +new Date;
                       function loop (now) {
                         if (running !== false) {
                           // fallback to setTimeout if requestAnimationFrame wasn't found
                           raf ? raf(loop, element)
                               : setTimeout(loop, 1000 / 60);
                           // Make sure to use a valid time, since:
                           // - Chrome 10 doesn't return it at all
                           // - setTimeout returns the actual timeout
                           now = now && now > 1E4 ? now : +new Date;
                           var deltaT = now - lastFrame;
                           // do not render frame when deltaT is too high
                           if (deltaT < 160) {
                             running = render(deltaT, now);
                           }
                           lastFrame = now;
                         }
                       }
                       loop();
                     };
})(window, Date);

// Usage
//animLoop(function (deltaT, now) {
//           // rendering code goes here
//           // return false; will stop the loop
//         },
//         animWrapper);
