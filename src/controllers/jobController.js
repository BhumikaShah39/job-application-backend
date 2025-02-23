import Job from "../models/jobModel.js";
import SearchHistory from "../models/searchModel.js";

export const addJob = async (req, res) => {
  try {
    const {
      title,
      company,
      workplaceType,
      location,
      jobType,
      category,
      subCategory,
      notificationPreference,
      description, 
    } = req.body;

    // Create a new job
    const newJob = new Job({
      title,
      company,
      workplaceType,
      location,
      jobType,
      category,
      subCategory,
      notificationPreference,
      description, 
      hirer: req.user._id, // Logged-in hirer ID
    });

    await newJob.save();
    res.status(201).json({ message: "Job added successfully!", job: newJob });
  } catch (error) {
    console.error("Error adding job:", error);
    res.status(500).json({ message: "Failed to add job", error: error.message });
  }
};
export const getJobsAddedByYou = async (req, res) => {
  try {
    const hirerId = req.user._id; // Logged-in hirer's ID
    const jobs = await Job.find({ hirer: hirerId }); // Fetch jobs created by this user
    res.status(200).json({ jobs });
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ message: "Failed to fetch jobs", error: error.message });
  }
};

export const searchJobs = async (req, res) => {
  try {
    const { searchTerm, category, sortBy } = req.query;
    const userId = req.user ? req.user._id : null; // Ensure user is logged in

    let query = {};

    if (searchTerm) {
      query.$or = [
        { title: { $regex: searchTerm, $options: "i" } },
        { company: { $regex: searchTerm, $options: "i" } },
        { location: { $regex: searchTerm, $options: "i" } },
      ];
    }

    if (category) query.category = category;

    // Sorting
    let sortOption = { createdAt: -1 };
    if (sortBy === "oldest") sortOption = { createdAt: 1 };

    const jobs = await Job.find(query).sort(sortOption);

    // ✅ Store search term **only if user is logged in**
    if (userId && searchTerm) {
      await SearchHistory.create({
        userId,
        searchTerm,
        category,
      });
    }

    res.status(200).json({ jobs });
  } catch (error) {
    console.error("Error searching jobs:", error);
    res.status(500).json({ message: "Server error" });
  }
};


export const getSearchHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const searchHistory = await SearchHistory.find({ userId })
      .sort({ createdAt: -1 }) // Latest searches first
      .limit(10); // Get the last 10 searches

    res.status(200).json({ searchHistory });
  } catch (error) {
    console.error("Error fetching search history:", error);
    res.status(500).json({ message: "Server error" });
  }
};
