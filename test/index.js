"use strict";

var assert = require("assert");
var TestIndex = require("../");
var Task = TestIndex.Task;
var createTask = TestIndex.createTask;

describe("测试 Task：", function () {

    describe("构造函数 Task", function () {
        it("返回 Task 的实例", function () {
            assert.ok(new Task() instanceof Task);
        });
        it("直接调用 Task 时也返回 Task 的实例", function () {
            assert.ok(Task() instanceof Task);
        });
        it("省略参数 max 时 Task 可同时运行的最大任务数默认为 1", function () {
            var task = new Task();
            assert.equal(task._maxRunningTasks, 1);
        });
        it("当 max = 0 时 Task 可同时运行的任务数无限制", function () {
            var task = new Task(0);
            assert.equal(task._maxRunningTasks, Math.pow(2, 32));
        });
    });

    describe("工厂函数 createTask", function () {
        it("返回 Task 的实例", function () {
            assert.ok(createTask() instanceof Task);
        });
    });

    describe("Task 的方法", function () {
        describe("#.start() -", function () {
            it("调用后 Task 实例的状态变为 running", function () {
                var task = new Task;
                task.add();
                var rst = task.start();
                assert.strictEqual(rst, true);
                assert.strictEqual(task.state, "running");
            });
            it("启动后会触发 start 事件", function (done) {
                var task = new Task;
                task.add();
                task.on("start", function () {
                    done();
                });
                task.start();
            });
            it("如果启动前，状态不是 pending，返回 false", function () {
                var task = new Task;
                task._state = "running";
                var rst = task.start();
                assert.strictEqual(rst, false);
            });
        });
        describe("#.add() -", function () {
            it("返回成功添加的任务的序号（id）", function () {
                var task = new Task;
                var rst = task.add(function () {});
                assert.strictEqual(rst, 1);
                rst = task.add(function () {});
                assert.strictEqual(rst, 2);
            });
            it("如果只传一个参数，则 name 值自动设置为任务的序号（#id）", function () {
                var task = new Task;
                var rst = task.add(function () {});
                var name = task._queues[task._queues.length - 1].name;
                assert.strictEqual(name, "#" + rst);
            });
        });
        describe("#.remove() -", function () {
            it("删除指定任务，成功返回 true", function () {
                var task = new Task;
                var id = "test1";
                task.add(id, function () {});
                var rst = task.remove(id);
                assert.strictEqual(rst, true);
            });
            it("删除指定任务，失败返回 false", function () {
                var task = new Task;
                var rst = task.remove("task1");
                assert.strictEqual(rst, false);
            });
            it("删除指定 id 的任务", function () {
                var task = new Task;
                var id = task.add();
                var rst = task.remove(id);
                assert.strictEqual(rst, true);
            });
            it("删除指定 name 的任务", function () {
                var task = new Task;
                var name = "task1";
                task.add(name, function () {});
                var rst = task.remove(name);
                assert.strictEqual(rst, true);
            });
            it("删除指定 function 的任务", function () {
                var task = new Task;
                var func = function () {};
                task.add(func);
                var rst = task.remove(func);
                assert.strictEqual(rst, true);
            });
        });
        describe("#.pause() -", function () {
            it("成功暂停，返回 true，否则返回 false", function () {
                var task = new Task;
                var isFalse = task.pause();
                task.start();
                var isTrue = task.pause();
                assert.strictEqual(isFalse, false);
                assert.strictEqual(isTrue, true);
            });
            it("触发 pause 事件", function (done) {
                var task = new Task;
                task.on("pause", function () {
                    done();
                });
                task.start();
                task.pause();
            });
        });
        describe("#.resume() -", function () {
            it("成功恢复返回 true，否则返回 false", function () {
                var task = new Task;
                var isTrue = task.resume();
                task.stop();
                var isFalse = task.resume();
                assert.strictEqual(isTrue, true);
                assert.strictEqual(isFalse, false);
            });
            it("触发 resume 事件", function (done) {
                var task = new Task;
                task.on("resume", function () {
                    done();
                });
                task.resume();
            });
        });
        describe("#.stop() -", function () {
            it("触发 stop 事件", function (done) {
                var task = new Task;
                task.on("stop", function () {
                    done();
                });
                task.stop();
            });
        });
    });

    describe("测试 Task 私有方法", function () {
        describe("测试 ._runTask()", function () {
            it("触发 task-start 事件", function (done) {
                var task = new Task;
                var name = "#1";
                task._runTask({
                    name: name,
                    func: function () {}
                });
                task.on("task-start", function (evt) {
                    try {
                        assert.strictEqual(evt.name, name);
                        done();
                    } catch (ex) {
                        done(ex);
                    }
                });
            });
            it("触发 task-finish", function (done) {
                var task = new Task;
                var name = "#1";
                var value = 100;
                task._runTask({
                    name: name,
                    func: value
                });
                task.on("task-finish", function (rst) {
                    try {
                        assert.strictEqual(rst.name, name);
                        assert.strictEqual(rst.value, value);
                        done();
                    } catch (ex) {
                        done(ex);
                    }
                });
            });
            it("触发 task-error", function (done) {
                var task = new Task;
                var name = "#1";
                var error = new Error("xxx");
                task._runTask({
                    name: name,
                    func: function () {
                        throw error;
                    }
                });
                task.on("task-error", function (rst) {
                    try {
                        assert.strictEqual(rst.error, error);
                        done();
                    } catch (ex) {
                        done(ex);
                    }
                });
            });
        });
        describe("测试 ._runTasks()", function () {
            it("#1", function (done) {
                var task = new Task;
                task.add("#1", function (val) {
                    return val * val;
                }, 10);
                task.add("#2", function (rst) {
                    try {
                        assert.strictEqual(rst, 100);
                        done();
                    } catch (ex) {
                        done(ex);
                    }
                });
                task.start();
            });
        });
    });
});
