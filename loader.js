var Module = null;

(function (Promise) {
   function IALoader(canvas, game, callback, scale, splashimg) {
     var SAMPLE_RATE = (function () {
                          var audio_ctx = window.AudioContext || window.webkitAudioContext || false;
                          if (!audio_ctx) {
                            return false;
                          }
                          var sample = new audio_ctx;
                          return sample.sampleRate.toString();
                        }());

     var metadata, module, modulecfg, config_args,
         emulator = new Emulator(canvas).setScale(scale)
                                        .setSplashImage(splashimg)
                                        .setLoad(loadFiles)
                                        .setcallback(callback);
     var cfgr;
     function loadFiles(fetch_file, splash) {
       splash.loading_text = 'Downloading game metadata...';
       return new Promise(function (resolve, reject) {
                            var loading = fetch_file('Game Metadata',
                                                     get_meta_url(game),
                                                     'document', true);
                            loading.then(function (data) {
                                           metadata = data;
                                           splash.loading_text = 'Downloading emulator metadata...';
                                           module = metadata.getElementsByTagName("emulator")
                                                            .item(0)
                                                            .textContent;
                                           return fetch_file('Emulator Metadata',
                                                             get_emulator_config_url(module),
                                                             'text', true, true);
                                         },
                                         function () {
                                           splash.loading_text = 'Failed to download metadata!';
                                           splash.failed_loading = true;
                                           reject(1);
                                         })
                                   .then(function (data) {
                                           modulecfg = JSON.parse(data);
                                           var mame = 'arcade' in modulecfg && parseInt(modulecfg['arcade'], 10);
                                           var get_files;

                                           if (module && module.indexOf("dosbox") === 0) {
                                             cfgr = DosBoxLoader;
                                             get_files = get_dosbox_files;
                                           }
                                           else if (module) {
                                             if (mame) {
                                               cfgr = JSMAMELoader;
                                               get_files = get_mame_files;
                                             } else {
                                               cfgr = JSMESSLoader;
                                               get_files = get_mess_files;
                                             }
                                           }
                                           else {
                                             throw new Error("Unknown module type "+ module +"; cannot configure the emulator.");
                                           }

                                           var nr = modulecfg['native_resolution'];
                                           config_args = [cfgr.emulatorJS(get_js_url(modulecfg.js_filename)),
                                                          cfgr.locateAdditionalEmulatorJS(locateAdditionalJS),
                                                          cfgr.nativeResolution(nr[0], nr[1]),
                                                          cfgr.aspectRatio(nr[0] / nr[1]),
                                                          cfgr.sampleRate(SAMPLE_RATE),
                                                          cfgr.muted(!($.cookie && $.cookie('unmute')))];

                                           if (module && module.indexOf("dosbox") === 0) {
                                               config_args.push(cfgr.startExe(metadata.getElementsByTagName("emulator_start")
                                                                                      .item(0)
                                                                                      .textContent));
                                           } else if (module) {
                                             config_args.push(cfgr.driver(modulecfg.driver),
                                                              cfgr.extraArgs(modulecfg.extra_args));
                                             if (modulecfg.peripherals && modulecfg.peripherals[0]) {
                                               config_args.push(cfgr.peripheral(modulecfg.peripherals[0],
                                                                                get_game_name(game)));
                                             }
                                           }

                                           splash.loading_text = 'Downloading game data...';
                                           return Promise.all(get_files(cfgr, metadata, modulecfg));
                                         },
                                         function () {
                                           splash.loading_text = 'Failed to download metadata!';
                                           splash.failed_loading = true;
                                           reject(2);
                                         })
                                   .then(function (game_files) {
                                           resolve(cfgr.apply(null, extend(config_args, game_files)));
                                         },
                                         function () {
                                           splash.loading_text = 'Failed to download game data!';
                                           splash.failed_loading = true;
                                           reject(3);
                                         });
                          });
     }

     function locateAdditionalJS(filename) {
       if ("file_locations" in modulecfg && filename in modulecfg.file_locations) {
         return get_js_url(modulecfg.file_locations[filename]);
       }
       throw new Error("Don't know how to find file: "+ filename);
     }

     function get_dosbox_files(cfgr, emulator, modulecfg) {
       // first get the urls
       var urls = [], files = [];
       var len = metadata.documentElement.childNodes.length, i;
       for (i = 0; i < len; i++) {
         var node = metadata.documentElement.childNodes[i];
         var m = node.nodeName.match(/^dosbox_drive_[a-zA-Z]$/);
         if (m) {
           urls.push(node);
         }
       }

       // and a count, then fetch them in
       var len = urls.length;
       for (i = 0; i < len; i++) {
         var node = urls[i],
             drive = node.nodeName.split('_')[2],
             title = 'Game File ('+ (i+1) +' of '+ (game ? len+1 : len) +')',
             url = get_zip_url(node.textContent);
         files.push(cfgr.mountZip(drive, cfgr.fetchFile(title, url)));
       }

       if (game) {
         var drive = 'c',
             title = 'Game File ('+ (i+1) +' of '+ (game ? len+1 : len) +')',
             url = get_zip_url(game);
         files.push(cfgr.mountZip(drive, cfgr.fetchFile(title, url)));
       }

       return files;
     }

     function get_mess_files(cfgr, metadata, modulecfg) {
       var files = [],
           bios_files = modulecfg['bios_filenames'];
       bios_files.forEach(function (fname, i) {
                            if (fname) {
                              var title = "Bios File ("+ (i+1) +" of "+ bios_files.length +")";
                              files.push(cfgr.mountFile('/'+ fname,
                                                        cfgr.fetchFile(title,
                                                                       get_bios_url(fname))));
                            }
                          });
       files.push(cfgr.mountFile('/'+ get_game_name(game),
                                 cfgr.fetchFile("Game File",
                                                get_zip_url(game))));
       files.push(cfgr.mountFile('/'+ modulecfg['driver'] + '.cfg',
                                 cfgr.fetchOptionalFile("CFG File",
                                                        get_zip_url(get_item_name(game) +'/'+ modulecfg['driver'] + '.cfg'))));
       return files;
     }

     function get_mame_files(cfgr, metadata, modulecfg) {
       var files = [],
           bios_files = modulecfg['bios_filenames'];
       bios_files.forEach(function (fname, i) {
                            if (fname) {
                              var title = "Bios File ("+ (i+1) +" of "+ bios_files.length +")";
                              files.push(cfgr.mountFile('/'+ fname,
                                                        cfgr.fetchFile(title,
                                                                       get_bios_url(fname))));
                            }
                          });
       files.push(cfgr.mountFile('/'+ get_game_name(game),
                                 cfgr.fetchFile("Game File",
                                                get_zip_url(game))));
       files.push(cfgr.mountFile('/'+ modulecfg['driver'] + '.cfg',
                                 cfgr.fetchOptionalFile("CFG File",
                                                        get_zip_url(get_item_name(game) +'/'+ modulecfg['driver'] + '.cfg'))));
       return files;
     }

     var get_item_name = function (game_path) {
       return game_path.split('/').shift();
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

     var get_bios_url = function (bios_filename) {
       return "//cors.archive.org/cors/jsmess_bios_v2/"+ bios_filename;
     };

     function mountat (drive) {
       return function (data) {
         return { drive: drive,
                  mountpoint: "/" + drive,
                  data: data
                };
       };
     }

     return emulator;
   }

   function BaseLoader() {
     return Array.prototype.reduce.call(arguments, extend);
   }

   BaseLoader.canvas = function (id) {
     var elem = id instanceof Element ? id : document.getElementById(id);
     return { canvas: elem };
   };

   BaseLoader.emulatorJS = function (url) {
     return { emulatorJS: url };
   };

   BaseLoader.locateAdditionalEmulatorJS = function (func) {
     return { locateAdditionalJS: func };
   };

   BaseLoader.nativeResolution = function (width, height) {
     if (typeof width !== 'number' || typeof height !== 'number')
       throw new Error("Width and height must be numbers");
     return { width: Math.floor(width), height: Math.floor(height) };
   };

   BaseLoader.aspectRatio = function (ratio) {
     if (typeof ratio !== 'number')
       throw new Error("Aspect ratio must be a number");
     return { aspectRatio: ratio };
   };

   BaseLoader.sampleRate = function (rate) {
     return { sample_rate: rate };
   };

   BaseLoader.muted = function (muted) {
     return { muted: muted };
   };

   BaseLoader.mountZip = function (drive, file) {
     return { files: [{ drive: drive,
                        mountpoint: "/" + drive,
                        file: file
                      }] };
   };

   BaseLoader.mountFile = function (filename, file) {
     return { files: [{ mountpoint: filename,
                        file: file
                      }] };
   };

   BaseLoader.fetchFile = function (title, url) {
     return { title: title, url: url };
   };

   BaseLoader.fetchOptionalFile = function (title, url) {
     return { title: title, url: url, optional: true };
   };

   BaseLoader.localFile = function (title, data) {
     return { title: title, data: data };
   };

   function DosBoxLoader() {
     var config = Array.prototype.reduce.call(arguments, extend);
     config.emulator_arguments = build_dosbox_arguments(config.emulatorStart, config.files);
     return config;
   }
   DosBoxLoader.__proto__ = BaseLoader;

   DosBoxLoader.startExe = function (path) {
     return { emulatorStart: path };
   };

   function JSMESSLoader() {
     var config = Array.prototype.reduce.call(arguments, extend);
     config.emulator_arguments = build_mess_arguments(config.muted, config.mess_driver,
                                                      [config.width, config.height], config.sample_rate,
                                                      config.peripheral, config.extra_mess_args);
     return config;
   }
   JSMESSLoader.__proto__ = BaseLoader;

   JSMESSLoader.driver = function (driver) {
     return { mess_driver: driver };
   };

   JSMESSLoader.peripheral = function (peripheral, game) {
     return { peripheral: [peripheral, game] };
   };

   JSMESSLoader.extraArgs = function (args) {
     return { extra_mess_args: args };
   };

   function JSMAMELoader() {
     var config = Array.prototype.reduce.call(arguments, extend);
     config.emulator_arguments = build_mame_arguments(config.muted, config.mess_driver,
                                                      [config.width, config.height], config.sample_rate,
                                                      config.extra_mess_args);
     return config;
   }
   JSMAMELoader.__proto__ = BaseLoader;

   JSMAMELoader.driver = function (driver) {
     return { mess_driver: driver };
   };

   JSMAMELoader.extraArgs = function (args) {
     return { extra_mess_args: args };
   };

   var build_mess_arguments = function (muted, driver, native_resolution, sample_rate, peripheral, extra_args) {
     var args = [driver,
                 '-verbose',
                 '-rompath', 'emulator',
                 '-window',
                 '-resolution', native_resolution.join('x'),
                 '-nokeepaspect'];

     if (muted) {
       args.push('-sound', 'none');
     } else if (sample_rate) {
       args.push('-samplerate', sample_rate);
     }

     if (peripheral && peripheral[0]) {
       args.push('-' + peripheral[0],
                 '/emulator/'+ (peripheral[1].replace(/\//g,'_')));
     }

     if (extra_args) {
       args = args.concat(extra_args);
     }

     return args;
   };

   var build_mame_arguments = function (muted, driver, native_resolution, sample_rate, extra_args) {
     var args = [driver,
                 '-verbose',
                 '-rompath', 'emulator',
                 '-window',
                 '-resolution', native_resolution.join('x'),
                 '-nokeepaspect'];

     if (muted) {
       args.push('-sound', 'none');
     } else if (sample_rate) {
       args.push('-samplerate', sample_rate);
     }

     if (extra_args) {
       args = args.concat(extra_args);
     }

     return args;
   };

    var build_dosbox_arguments = function (emulator_start, files) {
      var args = [];

      var len = files.length;
      for (var i = 0; i < len; i++) {
        if ('mountpoint' in files[i]) {
          args.push('-c', 'mount '+ files[i].drive +' /emulator'+ files[i].mountpoint);
        }
      }

      var path = emulator_start.split(/\\|\//); // I have LTS already
      args.push('-c', /^[a-zA-Z]:$/.test(path[0]) ? path.shift() : 'c:');
      var prog = path.pop();
      if (path && path.length)
        args.push('-c', 'cd '+ path.join('/'));
      args.push('-c', prog);

      return args;
    };

   function Emulator(canvas, callback, loadFiles) {
     var js_url;
     var requests = [];
     var drawloadingtimer;
     var splashimg = new Image();
     var spinnerimg = new Image();
     spinnerimg.src = '/images/spinner.png';
     // TODO: Have an enum value that communicates the current state of the emulator, e.g. 'initializing', 'loading', 'running'.
     var has_started = false;
     var loading = false;
     var splash = { loading_text: "",
                    spinning: true,
                    spinner_rotation: 0,
                    finished_loading: false,
                    colors: { foreground: 'black',
                              background: 'white' } };

     var SDL_PauseAudio;
     this.mute = function (state) {
       try {
         if (!SDL_PauseAudio)
           SDL_PauseAudio = Module.cwrap('SDL_PauseAudio', '', ['number']);
         SDL_PauseAudio(state);
       } catch (x) {
         console.log("Unable to change audio state:", x);
       }
       return this;
     };

     var css_resolution, scale, aspectRatio;
     // right off the bat we set the canvas's inner dimensions to
     // whatever it's current css dimensions are; this isn't likely to be
     // the same size that dosbox/jsmess will set it to, but it avoids
     // the case where the size was left at the default 300x150
     if (!canvas.hasAttribute("width")) {
       canvas.width = canvas.style.width;
       canvas.height = canvas.style.height;
     }

     this.setScale = function(_scale) {
       scale = _scale;
       return this;
     };

     this.setSplashImage = function(_splashimg) {
       if (_splashimg) {
         splashimg.src = _splashimg;
       }
       return this;
     };

     this.setCSSResolution = function(_resolution) {
       css_resolution = _resolution;
       return this;
     };

     this.setAspectRatio = function(_aspectRatio) {
       aspectRatio = _aspectRatio;
       return this;
     };

     this.setcallback = function(_callback) {
       callback = _callback;
       return this;
     };

     this.setSplashColors = function (colors) {
       this.splash.colors = colors;
       return this;
     };

     this.setLoad = function (loadFunc) {
       loadFiles = loadFunc;
       return this;
     };

     var start = function () {
       if (has_started)
         return false;
       has_started = true;

       var k, c, game_data;
       drawsplash();

       var loading = loadFiles(fetch_file, splash);
       loading.then(function (_game_data) {
                      game_data = _game_data;
                      game_data.fs = new BrowserFS.FileSystem.MountableFileSystem();
                      var Buffer = BrowserFS.BFSRequire('buffer').Buffer;

                      function fetch(file) {
                        if ('data' in file && file.data !== null && typeof file.data !== 'undefined') {
                          return Promise.resolve(file.data);
                        }
                        return fetch_file(file.title, file.url, null, null, file.optional);
                      }

                      function mountat(drive) {
                        return function (data) {
                          if (data !== null) {
                            drive = drive.toLowerCase();
                            var mountpoint = '/'+ drive;
                            game_data.fs.mount(mountpoint, BFSOpenZip(new Buffer(data)));
                          }
                        };
                      }

                      function saveat(filename) {
                        return function (data) {
                          if (data !== null) {
                            game_data.fs.writeFileSync(filename, new Buffer(data), null, flag_w, 0x1a4);
                          }
                        };
                      }

                      return Promise.all(game_data.files.map(function (f) {
                                                               if (f && f.file)
                                                                 if (f.drive) {
                                                                   return fetch(f.file).then(mountat(f.drive));
                                                                 } else if (f.mountpoint) {
                                                                   return fetch(f.file).then(saveat(f.mountpoint));
                                                                 }
                                                               return null;
                                                             }));
                    })
              .then(function (game_files) {
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

                      // Don't let arrow, pg up/down, home, end affect page position
                      blockSomeKeys();
                      setupFullScreen();
                      disableRightClickContextMenu(canvas);
                      resizeCanvas(canvas,
                                   scale = game_data.scale || scale,
                                   css_resolution = game_data.nativeResolution || css_resolution,
                                   aspectRatio = game_data.aspectRatio || aspectRatio);

                      // Emscripten doesn't use the proper prefixed functions for fullscreen requests,
                      // so let's map the prefixed versions to the correct function.
                      canvas.requestPointerLock = getpointerlockenabler();

                      moveConfigToRoot(game_data.fs);
                      Module = init_module(game_data.emulator_arguments, game_data.fs, game_data.locateAdditionalJS);

                      if (game_data.emulatorJS) {
                        splash.loading_text = 'Launching Emulator';
                        attach_script(game_data.emulatorJS);
                      } else {
                        splash.loading_text = 'Non-system disk or disk error';
                      }
                    },
                    function () {
                      splash.loading_text = 'Invalid media, track 0 bad or unusable';
                      splash.failed_loading = true;
                    });
       return this;
     };
     this.start = start;

     var init_module = function(args, fs, locateAdditionalJS) {
       return { arguments: args,
                screenIsReadOnly: true,
                print: function (text) { console.log(text); },
                canvas: canvas,
                noInitialRun: false,
                locateFile: locateAdditionalJS,
                preInit: function () {
                           splash.loading_text = 'Loading game file(s) into file system';
                           // Re-initialize BFS to just use the writable in-memory storage.
                           BrowserFS.initialize(fs);
                           var BFS = new BrowserFS.EmscriptenFS();
                           // Mount the file system into Emscripten.
                           FS.mkdir('/emulator');
                           FS.mount(BFS, {root: '/'}, '/emulator');
                           splash.finished_loading = true;
                           if (callback) {
                               window.setTimeout(function() { callback(this); }, 0);
                           }
                         }
              };
     };

     var fetch_file = function(title, url, rt, raw, optional) {
       var table = document.getElementById("dosbox-progress-indicator");
       var row, cell;
       if (!table) {
         table = document.createElement('table');
         table.setAttribute('id', "dosbox-progress-indicator");
         table.style.position = 'absolute';
         table.style.top = (canvas.offsetTop + (canvas.height / 2 + splashimg.height / 2) + 16 - (64/2)) +'px';
         table.style.left = canvas.offsetLeft + (64 + 32) +'px';
         table.style.color = 'foreground' in splash.colors ? splash.colors.foreground : 'black';
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
                                             cell.textContent = '✔';
                                             resolve(raw ? xhr.response
                                                         : new Int8Array(xhr.response));
                                           }
                                         };
                            xhr.onerror = function (e) {
                                            if (optional) {
                                              cell.textContent = '?';
                                              resolve(null);
                                            } else {
                                              cell.textContent = '✘';
                                              reject();
                                            }
                                          };
                            xhr.send();
                          });
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

     var resizeCanvas = function (canvas, scale, resolution, aspectRatio) {
       if (scale && resolution) {
         canvas.style.width = resolution.css_width * scale +'px';
         canvas.style.height = resolution.css_height * scale +'px';
       }
     };

     var drawsplash = function () {
       canvas.setAttribute('moz-opaque', '');
       var context = canvas.getContext('2d');
       if (splashimg.src && splashimg.complete) {
         draw_loading_status(0);
         animLoop(draw_loading_status);
       } else {
           splashimg.onload = function () {
                                draw_loading_status(0);
                                animLoop(draw_loading_status);
                              };
           if (!splashimg.src) {
             splashimg.src = '/images/dosbox.png';
           }
       }
     };

     var draw_loading_status = function (deltaT) {
       var context = canvas.getContext('2d');
       context.fillStyle = "background" in splash.colors ? splash.colors.background : 'white';
       context.fillRect(0, 0, canvas.width, canvas.height);
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
       context.fillStyle = "foreground" in splash.colors ? splash.colors.foreground : 'black';
       context.textAlign = 'center';
       context.fillText(splash.loading_text, canvas.width / 2, (canvas.height / 2) + (splashimg.height / 4));

       context.restore();

       var table = document.getElementById("dosbox-progress-indicator");
       if (table) {
         table.style.top = (canvas.offsetTop + (canvas.height / 2 + splashimg.height / 2) + 16 - (64/2)) +'px';
       }

       if (splash.finished_loading && table) {
         table.style.display = 'none';
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
           newScript.src = js_url;
           head.appendChild(newScript);
         }
     }

     function getpointerlockenabler() {
       return canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock;
     }

     function getfullscreenenabler() {
       return canvas.webkitRequestFullScreen || canvas.mozRequestFullScreen || canvas.requestFullScreen;
     }

     this.isfullscreensupported = function () {
        return !!(getfullscreenenabler());
     };

     function setupFullScreen() {
       var self = this;
       var fullScreenChangeHandler = function() {
                                       if (!(document.mozFullScreenElement || document.fullScreenElement)) {
                                         resizeCanvas(canvas, scale, css_resolution, aspectRatio);
                                       }
                                     };
       if ('onfullscreenchange' in document) {
         document.addEventListener('fullscreenchange', fullScreenChangeHandler);
       } else if ('onmozfullscreenchange' in document) {
         document.addEventListener('mozfullscreenchange', fullScreenChangeHandler);
       } else if ('onwebkitfullscreenchange' in document) {
         document.addEventListener('webkitfullscreenchange', fullScreenChangeHandler);
       }
     };

     this.requestFullScreen = function () {
       Module.requestFullScreen(1, 0);
     };

     /**
       * Prevents page navigation keys such as page up/page down from
       * moving the page while the user is playing.
       */
     function blockSomeKeys() {
       var blocked_keys = [33, 34, 35, 36, 37, 38, 39, 40];
       function keypress (e) {
         if (blocked_keys.indexOf(e.which) >= 0) {
           e.preventDefault();
           return false;
         }
         return true;
       }
       window.onkeydown = keypress;
     }

     /**
       * Disables the right click menu for the given element.
       */
     function disableRightClickContextMenu(element) {
       element.addEventListener('contextmenu',
                                function (e) {
                                  if (e.button == 2) {
                                    // Block right-click menu thru preventing default action.
                                    e.preventDefault();
                                  }
                                });
     }
   };

   function BFSOpenZip(loadedData) {
       var zipfs = new BrowserFS.FileSystem.ZipFS(loadedData),
           mfs = new BrowserFS.FileSystem.MountableFileSystem(),
           memfs = new BrowserFS.FileSystem.InMemory();
       mfs.mount('/zip', zipfs);
       mfs.mount('/mem', memfs);
       // Copy the read-only zip file contents to a writable in-memory storage.
       recursiveCopy(mfs, '/zip', '/mem');
       return memfs;
   };

   // This is such a hack. We're not calling the BrowserFS api
   // "correctly", so we have to synthesize these flags ourselves
   var flag_r = { isReadable: function() { return true; },
                  isWriteable: function() { return false; },
                  isTruncating: function() { return false; },
                  isAppendable: function() { return false; },
                  isSynchronous: function() { return false; },
                  isExclusive: function() { return false; },
                  pathExistsAction: function() { return 0; },
                  pathNotExistsAction: function() { return 1; }
                };
   var flag_w = { isReadable: function() { return false; },
                  isWriteable: function() { return true; },
                  isTruncating: function() { return false; },
                  isAppendable: function() { return false; },
                  isSynchronous: function() { return false; },
                  isExclusive: function() { return false; },
                  pathExistsAction: function() { return 0; },
                  pathNotExistsAction: function() { return 3; }
                };

   // Helper function: Recursively copies contents from one folder to another.
   function recursiveCopy(fs, oldDir, newDir) {
       var path = BrowserFS.BFSRequire('path');
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
           fs.writeFileSync(newFile,
                            fs.readFileSync(oldFile, null, flag_r),
                            null, flag_w, 0x1a4);
       }
   };

   /**
    * Searches for dosbox.conf, and moves it to '/dosbox.conf' so dosbox uses it.
    */
   function moveConfigToRoot(fs) {
     var dosboxConfPath = null;
     // Recursively search for dosbox.conf.
     function searchDirectory(dirPath) {
       fs.readdirSync(dirPath).forEach(function(item) {
         // Avoid infinite recursion by ignoring these entries, which exist at
         // the root.
         if (item === '.' || item === '..') {
           return;
         }
         // Append '/' between dirPath and the item's name... unless dirPath
         // already ends in it (which always occurs if dirPath is the root, '/').
         var itemPath = dirPath + (dirPath[dirPath.length - 1] !== '/' ? "/" : "") + item,
             itemStat = fs.statSync(itemPath);
         if (itemStat.isDirectory(itemStat.mode)) {
           searchDirectory(itemPath);
         } else if (item === 'dosbox.conf') {
           dosboxConfPath = itemPath;
         }
       });
     }

     searchDirectory('/');

     if (dosboxConfPath !== null) {
       fs.writeFileSync('/dosbox.conf',
                        fs.readFileSync(dosboxConfPath, null, flag_r),
                        null, flag_w, 0x1a4);
     }
   };

   function extend(a, b) {
     if (a === null)
       return b;
     if (b === null)
       return a;
     var ta = typeof a,
         tb = typeof b;
     if (ta !== tb) {
       if (ta === 'undefined')
         return b;
       if (tb === 'undefined')
         return a;
       throw new Error("Cannot extend an "+ ta +" with an "+ tb);
     }
     if (Array.isArray(a))
       return a.concat(b);
     if (ta === 'object') {
       Object.keys(b).forEach(function (k) {
                                a[k] = extend(a[k], b[k]);
                              });
       return a;
     }
     return b;
   }

   window.IALoader = IALoader;
   window.DosBoxLoader = DosBoxLoader;
   window.JSMESSLoader = JSMESSLoader;
   window.JSMAMELoader = JSMAMELoader;
   window.Emulator = Emulator;
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

// legacy
var JSMESS = JSMESS || {};
JSMESS.ready = function (f) { f(); };