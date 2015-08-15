"use strict";

var util = require("util");
var EventEmitter = require("events").EventEmitter;

/**
 * @class
 * @param {number} max - 同时运行的最大任务数
 */
var Task = exports.Task = function Task(max) {
    if (!(this instanceof Task)) {
        return new Task(max);
    }

    EventEmitter.call(this);

    if (max === 0) {
        max = Math.pow(2, 32);
    }

    var self = this;
    Object.defineProperties(this, {
        "_currentRunningTasks": {
            value: 0,
            writable: true
        },
        "_maxRunningTasks": {
            value: max || 1,
            writable: true
        },
        "_queues": {
            value: []
        },
        "_idx": {
            value: 0,
            writable: true
        },
        "_state": {
            value: "pending", // idle | pending | running | paused | stoped
            writable: true
        },
        "_lastValue": {
            value: undefined,
            writable: true
        },

        "pendingCount": {
            get: function () {
                return self._queues.length;
            },
            enumerable: true
        },
        "runningCount": {
            get: function () {
                return self._currentRunningTasks;
            },
            enumerable: true
        },
        "state": {
            get: function () {
                return self._state;
            },
            enumerable: true
        }
    });
};
util.inherits(Task, EventEmitter);

/**
 * 启动 Task
 * @method
 * @returns {boolean}
 */
Task.prototype.start = function (initVal) {
    if (this._state !== "pending") return false;
    this._started = true;
    this._state = "running";
    this._lastValue = initVal;
    this._runTasks(this._lastValue);
    this.emit("start");
    return true;
};

/**
 * @method
 * @param {string} [name] - 任务的名称，默认是该任务的序号（# + id）
 * @param {Function} func - 任务初始化函数
 * @param {*} val - 任务初始化函数参数值
 * @returns {number|boolean} - 如果成功添加，返回任务序号（id）；失败则返回 false
 */
Task.prototype.add = function (name, func, val) {
    if (this._queues.length >= Math.pow(2, 32) - 1) {
        return false;
    }
    ++this._idx;
    if (name === undefined) {
        name = "#" + this._idx;
    } else if (typeof name === "function") {
        val = func;
        func = name;
        name = "#" + this._idx;
    }
    this._queues.push({
        id: this._idx,
        name: name,
        func: func,
        val: val
    });
    if (this._state === "pending" && this._started) {
        this._state = "running";
        this._runTasks(this._lastValue);
    }
    return this._idx;
};

/**
 * 删除指定的任务
 * @method
 * @param {number|string|function} [name] - 需要删除的任务的序号（#id）或任务 name
 *  或该任务的初始化函数，如果省略，返回在当前任务队列的第一个任务
 * @returns {boolean} - 删除成功返回 true，失败返回 false
 */
Task.prototype.remove = function (name) {
    var queues = this._queues;

    if (arguments.length === 0) {
        return queues.shift() !== undefined;
    }

    var key = "";
    switch (typeof name) {
        case "function":
            key = "func";
            break;
        case "number":
            key = "id";
            break;
        default:
            key = "name";
            break;
    }
    var rst = false;
    for (var i = 0, len = queues.length; i < len; i++) {
        var task = queues[i];
        if (task[key] == name) {
            queues.splice(i, 1);
            --i;
            --len;
            rst = true;
        }
    }
    return rst;
};

/**
 * 暂停执行任务
 * @method
 */
Task.prototype.pause = function () {
    if (this._state === "running") {
        this._state = "paused";
        this.emit("pause");
        return true;
    }
    return this._state === "paused";
};

/**
 * @method
 * 恢复执行任务
 */
Task.prototype.resume = function () {
    if (this._state === "paused" || this._state === "pending") {
        this._state = "running";
        this.emit("resume");
        return true;
    }
    return this._state === "running";
};

/**
 * 停止执行任务
 * @method
 * 
 */
Task.prototype.stop = function () {
    this._state = "stoped";
    this._idx = 0;
    this._queues.length = 0;
    this.emit("stop");
    return this._state === "stoped";
};

/**
 * 开始执行任务
 * @method
 */
Task.prototype._runTask = function () {
    ++this._currentRunningTasks;
    var tick = Function.prototype.bind.apply(runTask, [this].concat([].slice.call(arguments)));
    process.nextTick(function () {
        tick();
    });

    function runTask(task) {
        var args = [].slice.call(arguments, 1);

        this.emit("task-start", {
            name: task.name
        });

        var rst;
        try {
            if (typeof task.func !== "function") {
                task.func = (function (val) {
                    return function () {
                        return val;
                    };
                })(task.func);
            }
            rst = task.func.apply(this, args);
            if (!(rst instanceof Promise)) {
                rst = Promise.resolve(rst);
            }
        } catch(ex) {
            rst = Promise.reject(ex);
        }
        var self = this;
        rst.then(function (val) {
            --self._currentRunningTasks;
            self.emit("task-finish", {
                name: task.name,
                value: val
            });
            self._then(self._lastValue = val);
        }).catch(function (err) {
            --self._currentRunningTasks;
            self.emit("task-error", {
                name: task.name,
                error: err
            });
            self._then(self._lastValue = undefined);
        });
    }
};

Task.prototype._runTasks = function () {
    var tick = Function.prototype.bind.apply(runTasks, [this].concat([].slice.call(arguments)));
    process.nextTick(function () {
        tick();
    });
    function runTasks() {
        if (this._state !== "running") return;

        var runingTask = this._maxRunningTasks - this._currentRunningTasks;
        if (runingTask <= 0) return;

        var tasks = this._queues.splice(0, runingTask);

        if (this._queues.length === 0) {
            this._state = "pending";
        }

        var args = [].slice.call(arguments);

        tasks.forEach(function (task) {
            var _args = args.slice();
            if (task.val !== undefined) {
                _args = [task.val];
            }
            delete task.val;
            _args.unshift(task);
            this._runTask.apply(this, _args);
        }, this);
    }
};

Task.prototype._then = function () {
    this._runTasks.apply(this, arguments);
};

exports.createTask = function (max) {
    return new Task(max);
};
