// Talk Shops Help page content: common questions, grouped by topic, with a search box.
// app.js helpView() renders window.TALKSHOPS_HELP.view(esc). Lesson ids match training.js.
(function () {
  "use strict";
  const sections = [
    { id: "start", title: "Getting Started", lesson: "bay", qs: [
      ["What is Talk Shops?", "Talk Shops keeps your customers updated from check-in to pickup. Your team tracks every car on one board, and each customer gets a private link by text or email where they can see progress, photos and the estimate, approve or decline work, and view the final bill."],
      ["What kinds of shops is it for?", "Every kind of auto service shop: quick lube and oil change, tire shops, brake and muffler, engine and transmission, general repair, diesel, and body and collision. Use the stages, quick services and saved prices that fit how your shop works."],
      ["Do my customers need to download an app or make an account?", "No. Customers just open the link you send. It works in any phone or computer browser."],
      ["How do I set up my shop?", "Create your shop account, add your shop name, phone, hours and labor rate, then bring in your price list (Settings → Saved items). Invite your team from Settings → Team. Most shops are ready in a few minutes."],
      ["Can I try it before I set up my own shop?", "Yes. Open the Demo Shop from the homepage to click around with sample cars, or take the narrated Guided Tour. Nothing you do in the demo is sent to anyone."],
      ["Does it work on a phone or tablet?", "Yes. Talk Shops runs in the browser on phones, tablets and computers. On a phone the main tabs sit in the bottom bar: Bay, Check In, Archive, How-To and More."],
    ]},
    { id: "checkin", title: "Checking In Cars", lesson: "checkin", qs: [
      ["How do I check in a car?", "Open Check In, enter the customer and vehicle, the concern and the mileage in, and confirm the customer agreed to receive updates. Talk Shops creates the repair order and sends the customer their private link."],
      ["How do I find a returning customer?", "At the top of Check In, use Returning customer? and search by name, phone, plate or VIN. Pick the match and the customer and vehicle details fill in for you."],
      ["How does Talk Shops track multiple visits for the same car?", "Visits are matched by the customer's phone number, plate or VIN. Open any car and look at Past Visits to see earlier repair orders, the mileage on each visit, and work the customer declined last time."],
      ["Can I decode a VIN?", "Yes. Type or paste the 17-character VIN at check-in (it is on the windshield or door jamb) and tap Decode. The year, make, model and engine fill in from the free NHTSA database."],
      ["Does it show recalls?", "Yes. Each car's screen lists open NHTSA recalls for that model, with a link to check the exact VIN. Not every car of that model is affected, so confirm by VIN."],
      ["Is there a faster way to type the make and model?", "Yes. Make, Model and Engine suggest matches as you type, so you can tap the right one instead of spelling it out."],
      ["Can the customer fill in their own details before they drop the car off?", "Yes. Choose to invite the customer instead of checking in at the counter. They get a link to add the vehicle details, describe the problem and upload photos, so the technician knows what is coming."],
      ["What are quick services and the fast lane?", "Quick services are bundles like \"Oil change + tire rotation\" that owners set up in Settings. Pick one at check-in and its items go straight onto the estimate. A fast lane service skips diagnosis and approval because the customer agreed to the price at the counter, and the car goes straight to In Progress."],
      ["How do I mark how urgent a car is?", "Choose Low, Medium or High urgency at check-in or on the car's screen. The mark shows on the Bay, and you can sort a column so the most urgent cars come first."],
    ]},
    { id: "bay", title: "The Bay and Your Workday", lesson: "bay", qs: [
      ["What is the Bay?", "The Bay is your shop board. Every open car sits in a column for its stage: Checked In, Diagnosing, Approval Needed, Waiting on Parts, In Progress, Quality Check and Ready for Pickup."],
      ["How do I move a car to the next stage?", "Open the car and choose its next stage. You can review the update before it goes to the customer, so they always know where their car is."],
      ["How do I find a car fast?", "Use the search at the top of the Bay to find a car by customer, vehicle or repair order. Click a stage heading to sort or filter that column."],
      ["What do the colors on the Bay cards mean?", "Cards change color as a car sits longer in the shop, so slow jobs stand out. Owners can set the time limits and colors in Settings."],
      ["How do I assign a car to a technician?", "Open the car and pick a name under Technician. Each technician can tap My Cars on the Bay to see only the cars assigned to them."],
      ["Can I set a promised-by time?", "Yes. Set Promised by on the car's screen. The Bay warns you when a car is due within two hours, and marks it Late once the time has passed."],
      ["How will I know when a customer replies or approves?", "Turn on Alerts at the top of the Bay. You will hear a chime and get a browser notification when a customer replies or answers an estimate, and the tab title shows a count. Alerts are set per browser, so turn them on at each computer you use."],
      ["What is Today's Summary?", "Owners can tap Today's Summary on the Bay to see cars checked in and picked up, the picked-up total, work approved and declined today, average time in the shop, updates sent, cars finished by each technician, and anything past its promised time."],
      ["Can I record mileage?", "Yes. Enter mileage in at check-in and mileage out at pickup. Both show on the printed work order and bill and in the car's past visits."],
    ]},
    { id: "inspect", title: "Inspections, Photos and Notes", lesson: "walk", qs: [
      ["What is the walk-through?", "A quick before-and-after check of the car's key points, each marked Good, Watch or Repair. The customer sees the before and after side by side on their page."],
      ["Can I record tire tread depth?", "Yes. On the walk-through Tires row, enter the tread depth in 32nds of an inch for each wheel."],
      ["What are walk-around photos?", "Tap Ask for walk-around photos and the customer gets guided steps to photograph the car from eight angles. This records the car's condition before work starts."],
      ["How does AI damage marking work?", "On the walk-around photos, tap Find damage with AI to mark likely dents, scratches and cracks. A technician confirms or edits each mark, and the customer only sees the marks your team confirmed."],
      ["Can I add photos and notes for the customer?", "Yes. Add photos and technician notes on the car's screen. You can type or use voice typing. Customers see them on their page with example photos and diagrams for common repairs."],
      ["Can I keep a note just for my team?", "Yes. Mark a note Shop only and it stays inside your shop. Customers never see shop-only notes."],
    ]},
    { id: "estimates", title: "Estimates and Prices", lesson: "estimates", qs: [
      ["How do I build an estimate?", "Open the car and add line items. Type a few letters to pick from your saved items, enter hours or quantity, and mark each line Required, Recommended or Optional so the customer knows what matters most."],
      ["How do customers approve work?", "They open their link, approve or decline each line, and sign on their phone. You see what they picked, the approved total and when they signed."],
      ["How do I bring in my price list?", "New shops see a Bring in your prices step during setup, and owners can do it any time in Settings → Saved items. Upload an Excel or CSV file, a PDF, or a photo of your printed price sheet. Talk Shops reads it and lets you review every item before anything is saved."],
      ["What if my price sheet has an unusual layout?", "Talk Shops reads most sheets on its own. If it finds only a few items, try Read it with AI instead. Anything it is unsure about is highlighted so you can check it before saving."],
      ["Can I download or replace my saved items?", "Yes. In Saved items, use Import or download your list to download it as Excel or CSV, edit it, and upload it again to replace your whole list."],
      ["Can I use labor hours from a labor guide?", "Yes. Saved labor items can carry hours. When you add one to an estimate, the price is your rate times the hours."],
    ]},
    { id: "customers", title: "Texts, Emails and Your Customers", lesson: "customer", qs: [
      ["What does the customer see?", "Their private page shows the car's progress, photos, technician notes, the walk-through, the estimate to approve, and the final bill. It updates as your team works."],
      ["How do customers get updates?", "By text, email or both, based on the preference you set at check-in. The first message has their private link."],
      ["Can customers text us back?", "Yes. Replies show on the car's screen. With Smart Replies (Pro), Talk Shops can answer routine questions like repair status, shop hours or resending the estimate link. You choose which replies go out automatically, and everything else waits for your team."],
      ["What are reminder texts?", "On a car's screen, schedule a reminder for the next service or for work the customer declined. Talk Shops texts them around that date with your shop's details. Today's Summary reminds you when work was declined."],
      ["How do customers stop reminder texts?", "Every reminder ends with Reply STOP to opt out. Customers can also tap Stop reminder texts on their page. Either one cancels their upcoming reminders."],
      ["A customer did not get an update. What should I check?", "Open the car and check the message delivery result. Then use Edit Customer Info to check the phone, email, notification preference and consent, fix anything wrong, and send the update again."],
      ["Where do customer email replies go?", "To the shop email set in Settings, so make sure it is an inbox someone watches."],
    ]},
    { id: "howto", title: "How-To Repair Assistant", lesson: "howto", qs: [
      ["What is the How-To tab?", "A repair assistant for your technicians. Pick a car in the Bay or enter one, ask how to do a job, and get steps, tools, parts, typical specs and safety notes."],
      ["Can it find videos?", "Yes. Each answer has Watch First links to YouTube and CarCareKiosk videos for that vehicle and job."],
      ["Does it give part numbers?", "When it is confident, it lists part numbers with links to look them up. Always confirm parts by VIN with your supplier."],
      ["Can I trust the specs?", "Use them as a starting point. Specs are labeled typical, and every answer reminds you to confirm torque values and procedures in the manufacturer's service information."],
      ["Which plan includes How-To?", "Pro, and the free trial. Starter shops can upgrade any time from Plan."],
    ]},
    { id: "pickup", title: "Final Bill, Pickup and Archive", lesson: "pickup", qs: [
      ["How do I finish a job?", "Prepare the final bill, mark the car Ready for Pickup, and the customer is told it is ready. Confirm pickup when they leave, with the mileage out."],
      ["Can I use my own invoice?", "Yes. Send the itemized bill Talk Shops builds, or upload your own PDF invoice from your shop system."],
      ["Can I print a work order or bill?", "Yes. Open the car and tap Print Work Order or Print Bill. Both include the customer, vehicle, mileage, concern and line items, with a place for a signature."],
      ["Where do finished jobs go?", "Picked-up cars move to the Archive, where you can search by customer, vehicle or repair order. Archived jobs are kept for one year after pickup."],
      ["Can customers pay online?", "Not yet. Customers can see their final bill on their page, and you take payment at the counter as usual."],
    ]},
    { id: "team", title: "Team, Roles and Sign-In", lesson: "team", qs: [
      ["How do I add my team?", "Owners open Settings → Team and invite people by email as an owner or a technician. Each person signs in with the email that got the invitation."],
      ["What can technicians do?", "Technicians work on cars: check in, update stages, add photos and notes, build estimates and use How-To. Owners also handle shop settings, prices, quick services, team invitations, billing, approval requests and closing jobs."],
      ["How many people can use Talk Shops?", "Starter includes 3 staff seats with up to 2 owners. Pro includes 8 staff seats with up to 3 owners."],
      ["How do I reset my password?", "Choose Forgot password? on Shop Sign In. Get a code by email, or by text if you verified a reset phone number in Settings."],
      ["I did not get my account confirmation email.", "Check the address you typed and look in spam or junk. If you signed up with Google, use Continue with Google with that same account. Still stuck? Contact support below."],
    ]},
    { id: "plans", title: "Plans and Billing", lesson: "plan", qs: [
      ["How much does Talk Shops cost?", "Starter is $89 a month ($890 a year) with 1,000 texts a month. Pro is $149 a month ($1,490 a year) with 3,000 texts a month, more seats, Smart Replies and the How-To repair assistant. Both include unlimited email."],
      ["Is there a free trial?", "Yes. New shops start with a free trial that has a set number of texts and cars. The Plan tab shows how many days you have left. If you pick a plan during the trial, the first charge waits until the trial ends."],
      ["What happens when my trial ends?", "Everything you entered stays, and your customers' links still work. Choose a plan to send updates again."],
      ["How do I change or cancel my plan?", "Owners open Plan and use Manage Billing to change plans, update the card or cancel."],
      ["What if we run out of texts?", "Emails stay unlimited. Upgrade to Pro for more texts, or contact us if you need a higher limit."],
    ]},
    { id: "privacy", title: "Privacy and Your Data", lesson: "", qs: [
      ["Who can see a customer's page?", "Only someone with that customer's private link. Each link is unique to one repair."],
      ["Do you sell customer information?", "No. Customer details are used only to send your shop's updates. See our Privacy Policy for details."],
      ["How do you handle consent for texts?", "Your team confirms the customer agreed to updates at check-in. Customers can reply STOP at any time."],
    ]},
  ];

  const count = sections.reduce((n, s) => n + s.qs.length, 0);

  function view(esc) {
    return `<section class="panel help-faq" id="help-faq">
      <div class="help-faq-head"><h3>Common Questions</h3><label class="field help-search">Search help<input id="helpSearch" type="search" placeholder="Try “reminder”, “VIN” or “print”" autocomplete="off"></label></div>
      <nav class="help-topics" aria-label="Help topics">${sections.map((s) => `<a href="#help-${s.id}">${esc(s.title)}</a>`).join("")}</nav>
      <p id="helpNone" class="muted" hidden>No questions match. Try another word, or <a href="#help-support">ask our team</a>.</p>
      ${sections.map((s) => `<div class="help-group" id="help-${s.id}"><h4>${esc(s.title)}</h4>${s.qs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}${s.lesson ? `<a class="help-lesson-link" href="/demo.html?train=${s.lesson}">Watch the lesson →</a>` : ""}</div>`).join("")}
    </section>`;
  }

  function filter(q) {
    const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    let shown = 0;
    document.querySelectorAll("#help-faq .help-group").forEach((g) => {
      let any = 0;
      g.querySelectorAll("details").forEach((d) => {
        const text = d.textContent.toLowerCase();
        const hit = !words.length || words.every((w) => text.includes(w));
        d.hidden = !hit; d.open = !!words.length && hit;
        if (hit) any++;
      });
      g.hidden = !any; shown += any;
    });
    const none = document.getElementById("helpNone");
    if (none) none.hidden = shown > 0;
  }

  document.addEventListener("input", (e) => { if (e.target.id === "helpSearch") filter(e.target.value); });
  window.TALKSHOPS_HELP = { sections, count, view };
})();
