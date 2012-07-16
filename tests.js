module('users.cschuster.Tests').requires('lively.TestFramework').toRun(function() {

TestCase.subclass('users.cschuster.Tests.LifeTrackerTests',
'helper', {
    setUp: function() {
        this.tracker = new users.cschuster.Tests.LifeTracker();
    }
},
'testing', {
    testInitial: function() {
        this.assertEquals(this.tracker.getLife(), 20);
        this.assert(this.tracker.isAlive());
        this.assert(!this.tracker.isDead());
    },
    testDamage: function() {
        this.tracker.damage(10);
        this.assertEquals(this.tracker.getLife(), 10);
        this.assert(this.tracker.isAlive());
        this.assert(!this.tracker.isDead());
    },
    testDeadlyDamage: function() {
        this.tracker.damage(30);
        this.assertEquals(this.tracker.getLife(), 0);
        this.assert(!this.tracker.isAlive());
        this.assert(this.tracker.isDead());
    },
});
Object.subclass('users.cschuster.Tests.LifeTracker',
'initializing', {
    initialize: function() {
        this.life = 20;
    },
},
'accessing', {
    isAlive: function() {
        return this.life > 0;
    },
    isDead: function() {
        return !this.isAlive();
    },
    getLife: function() {
        return this.life;
    }
},
'manipulating', {
    damage: function(n) {
        this.life -= n;debugger;
        if (this.life < 0) this.life = 0;
    }
});

}) // end of module